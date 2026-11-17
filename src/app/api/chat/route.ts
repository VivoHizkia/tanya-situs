import { NextResponse } from "next/server";
import { answerQuestion, fixedMessage } from "@/lib/chat/answer";
import { getDb } from "@/lib/db/client";
import { limitsFor, monthKey } from "@/lib/limits";
import { callLlm } from "@/lib/llm";
import { allowRequest, clientKey } from "@/lib/rate-limit";
import { Bm25Index } from "@/lib/retrieval/bm25";
import { addUnanswered, countMessage, findPublicBot, loadChunks } from "@/lib/store";
import type { ChatResponse, ChatTurn } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two LLM calls, each with a retry and a fallback model, can take a while when the provider is busy.
export const maxDuration = 60;

const MAX_QUESTION_CHARS = 500;
const MAX_CATALOG_PAGES = 50;

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

function isChatTurn(value: unknown): value is ChatTurn {
  if (typeof value !== "object" || value === null) return false;
  const turn = value as Record<string, unknown>;
  return (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string";
}

export async function POST(req: Request) {
  let body: { botId?: unknown; question?: unknown; history?: unknown };
  try {
    body = (await req.json()) ?? {};
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const { botId, question, history } = body;
  if (typeof botId !== "string" || botId.length > 40) return badRequest("Unknown chatbot.");
  if (typeof question !== "string" || !question.trim())
    return badRequest("Please type a question.");
  if (question.length > MAX_QUESTION_CHARS) {
    return badRequest(`Please keep questions under ${MAX_QUESTION_CHARS} characters.`);
  }

  // Per visitor and per bot, so one busy site cannot use up another site's allowance.
  if (!allowRequest(`chat:${botId}:${clientKey(req)}`, 12)) {
    return NextResponse.json(
      { error: "Too many messages. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  const db = await getDb();
  const found = await findPublicBot(db, botId);
  if (!found) return NextResponse.json({ error: "Unknown chatbot." }, { status: 404 });
  const { bot, plan } = found;

  // The message is counted before it is answered: the count is what protects the LLM budget,
  // so a request that fails later still counts.
  const used = await countMessage(db, bot.accountId, monthKey());
  if (used > limitsFor(plan).messagesPerMonth) {
    const response: ChatResponse = {
      status: "not_found",
      answer: fixedMessage("quota", bot.language),
      sources: [],
      contactUrl: bot.contactUrl,
      offerLeadForm: true,
    };
    return NextResponse.json(response);
  }

  const chunks = await loadChunks(db, bot.id);
  const titles = [...new Set(chunks.map((chunk) => chunk.pageTitle))].slice(0, MAX_CATALOG_PAGES);

  // History comes from the browser, so anything that is not a well-formed turn is dropped.
  const turns = Array.isArray(history) ? history.filter(isChatTurn) : [];

  const response = await answerQuestion(
    {
      llm: callLlm,
      index: new Bm25Index(chunks),
      business: bot.name,
      pageLanguage: bot.language,
      catalog: titles.map((title) => `- ${title}`).join("\n") || "(no pages yet)",
      contactUrl: bot.contactUrl,
      onUnanswered: ({ question: asked, reason }) => addUnanswered(db, bot.id, asked, reason),
      onError: (message) => console.error(JSON.stringify({ chatError: message, botId: bot.id })),
    },
    question.trim(),
    turns,
  );
  return NextResponse.json(response);
}
