import { parseJsonObject, type LlmCall } from "@/lib/llm";
import type { Bm25Index } from "@/lib/retrieval/bm25";
import {
  ANSWER_STATUSES,
  type AnswerStatus,
  type ChatResponse,
  type ChatTurn,
  type Chunk,
  type SourceRef,
} from "@/lib/types";
import { checkPrices } from "./guardrails";
import { answerPrompt, formatContext, formatHistory, plannerPrompt } from "./prompts";

const MAX_HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 600;
const MAX_PASSAGES = 8;

// Fixed strings rather than model output, so they can never contain a made-up fact. The
// visitor may write in any language, so each exists in the languages the product is sold in.
const FIXED = {
  notFound: {
    en: "I couldn't find that on our pages, so I don't want to guess. Please contact us and we will answer you directly.",
    id: "Saya tidak menemukan informasi itu di halaman kami, jadi saya tidak mau menebak. Silakan hubungi kami dan kami akan menjawab langsung.",
  },
  error: {
    en: "Sorry, I can't answer right now. Please try again in a moment.",
    id: "Maaf, saya belum bisa menjawab sekarang. Silakan coba lagi sebentar lagi.",
  },
  quota: {
    en: "This assistant has answered all the questions it can this month. Please contact us directly.",
    id: "Asisten ini sudah mencapai batas pertanyaan bulan ini. Silakan hubungi kami langsung.",
  },
};

export function fixedMessage(kind: keyof typeof FIXED, language: string): string {
  return language === "id" ? FIXED[kind].id : FIXED[kind].en;
}

export type Unanswered = { question: string; reason: string };

// Passed in rather than imported so the tests can swap in a fake LLM.
export type ChatDeps = {
  llm: LlmCall;
  index: Bm25Index;
  business: string;
  // Language of the pages; search queries are written in it.
  pageLanguage: string;
  // One line per page, so the planner knows what the knowledge base covers.
  catalog: string;
  contactUrl: string | null;
  // Called for every question the bot could not answer from the pages.
  onUnanswered?: (entry: Unanswered) => Promise<void>;
  onError?: (message: string) => void;
};

type Plan = { language: string; intent: string; searchQuery: string };
type Draft = { status: AnswerStatus; answer: string; sourceIds: string[] };

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const isStatus = (value: unknown): value is AnswerStatus =>
  ANSWER_STATUSES.includes(value as AnswerStatus);

function recentHistory(history: ChatTurn[]): ChatTurn[] {
  return history
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_TURN_CHARS) }));
}

// Step 1. Ask the model for the language, the intent and a search query.
async function planQuestion(deps: ChatDeps, question: string, history: ChatTurn[]): Promise<Plan> {
  try {
    const raw = await deps.llm([
      { role: "system", content: plannerPrompt(deps.business, deps.pageLanguage, deps.catalog) },
      {
        role: "user",
        content: `CONVERSATION:\n${formatHistory(history)}\n\nLATEST MESSAGE:\n${question}`,
      },
    ]);
    const json = parseJsonObject<Record<string, unknown>>(raw);
    return {
      language: asText(json.language).slice(0, 2).toLowerCase() || deps.pageLanguage,
      intent: asText(json.intent) || "content",
      searchQuery: asText(json.search_query) || question,
    };
  } catch {
    // The planner is an optimisation. Without it we search with the visitor's own words.
    return { language: deps.pageLanguage, intent: "content", searchQuery: question };
  }
}

// Step 2. Search with the rewritten query, plus the original wording in case the rewrite
// dropped a keyword. Off-topic messages skip the search so no passage can leak into the reply.
function findPassages(index: Bm25Index, plan: Plan, question: string): Chunk[] {
  if (plan.intent === "out_of_scope" || plan.intent === "smalltalk") return [];

  const hits = [...index.search(plan.searchQuery, 6), ...index.search(question, 3)];
  const unique = new Map<string, Chunk>();
  for (const { chunk } of hits) {
    if (!unique.has(chunk.id)) unique.set(chunk.id, chunk);
  }
  return [...unique.values()].slice(0, MAX_PASSAGES);
}

// Step 3. Ask the model to answer from the passages. Anything unexpected in its JSON is
// replaced by the safest value.
async function draftAnswer(
  deps: ChatDeps,
  plan: Plan,
  passages: Chunk[],
  history: ChatTurn[],
  question: string,
): Promise<Draft> {
  const raw = await deps.llm([
    { role: "system", content: answerPrompt(deps.business, plan.language, plan.intent) },
    {
      role: "user",
      content: [
        `CONTEXT:\n${formatContext(passages)}`,
        `CONVERSATION SO FAR:\n${formatHistory(history)}`,
        `VISITOR QUESTION:\n${question}`,
      ].join("\n\n"),
    },
  ]);
  const json = parseJsonObject<Record<string, unknown>>(raw);
  const ids = Array.isArray(json.source_ids) ? json.source_ids : [];

  return {
    status: isStatus(json.status) ? json.status : "not_found",
    answer: asText(json.answer),
    sourceIds: ids.filter((id): id is string => typeof id === "string"),
  };
}

// Source links come from the chunks we retrieved, never from text the model wrote.
function toSources(cited: Chunk[]): SourceRef[] {
  const byUrl = new Map<string, SourceRef>();
  for (const chunk of cited) {
    if (!byUrl.has(chunk.url)) byUrl.set(chunk.url, { url: chunk.url, title: chunk.pageTitle });
  }
  return [...byUrl.values()].slice(0, 3);
}

function buildResponse(
  deps: ChatDeps,
  status: AnswerStatus,
  answer: string,
  cited: Chunk[],
): ChatResponse {
  // These are the moments a visitor wants a person, which is when a lead is worth asking for.
  const needsPerson = status === "not_found" || status === "contact";
  return {
    status,
    answer,
    sources: status === "answered" ? toSources(cited) : [],
    contactUrl: needsPerson ? deps.contactUrl : null,
    offerLeadForm: needsPerson,
  };
}

export async function answerQuestion(
  deps: ChatDeps,
  question: string,
  fullHistory: ChatTurn[],
): Promise<ChatResponse> {
  const history = recentHistory(fullHistory);

  const plan = await planQuestion(deps, question, history);
  const passages = findPassages(deps.index, plan, question);

  let draft: Draft;
  try {
    draft = await draftAnswer(deps, plan, passages, history, question);
  } catch (err) {
    deps.onError?.(err instanceof Error ? err.message : String(err));
    return buildResponse(deps, "not_found", fixedMessage("error", plan.language), []);
  }

  // Step 4. Checks that do not rely on the model following its instructions.
  const reject = async (reason: string) => {
    await deps.onUnanswered?.({ question, reason });
    return buildResponse(deps, "not_found", fixedMessage("notFound", plan.language), []);
  };

  // A source id only counts if that passage was actually retrieved for this question.
  const passageById = new Map(passages.map((chunk) => [chunk.id, chunk]));
  const citedIds = new Set(draft.sourceIds.filter((id) => passageById.has(id)));

  const prices = checkPrices(draft.answer, passages, citedIds);
  if (!prices.ok) return reject(`unsupported price ${prices.unsupported.join(", ")}`);
  for (const id of prices.extraSourceIds) citedIds.add(id);

  if (!draft.answer) return reject("empty answer");

  const cited = passages.filter((chunk) => citedIds.has(chunk.id));
  if (draft.status === "answered" && cited.length === 0) return reject("answer without sources");

  // The model itself said the pages do not cover this: keep its wording, record the gap.
  if (draft.status === "not_found") {
    await deps.onUnanswered?.({ question, reason: "not on the pages" });
  }
  return buildResponse(deps, draft.status, draft.answer, cited);
}
