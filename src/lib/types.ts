// --- Accounts and bots -------------------------------------------------------

export type PlanName = "free" | "pro";

export type Account = { id: string; email: string; plan: PlanName };

export type Bot = {
  id: string;
  accountId: string;
  name: string;
  // ISO 639-1 code of the language the site's pages are written in.
  language: string;
  welcome: string;
  contactUrl: string | null;
};

export type PageStatus = "ok" | "blocked" | "failed";

export type Page = {
  id: string;
  botId: string;
  url: string;
  title: string;
  status: PageStatus;
  error: string | null;
  chunkCount: number;
  fetchedAt: string;
};

export type Lead = { id: string; name: string; contact: string; question: string; at: string };

export type Unanswered = { id: string; question: string; reason: string; at: string };

// --- Ingestion ---------------------------------------------------------------

export type Section = { heading: string; lines: string[] };

export type ExtractedPage = { title: string; language: string | null; sections: Section[] };

export type Chunk = {
  id: string;
  url: string;
  pageTitle: string;
  section: string;
  text: string;
};

// --- Chat --------------------------------------------------------------------

export type ChatTurn = { role: "user" | "assistant"; content: string };

// The answer prompt in lib/chat/prompts.ts lists the same values; change both together.
export const ANSWER_STATUSES = [
  "answered",
  "not_found",
  "contact",
  "declined",
  "smalltalk",
] as const;

export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export type SourceRef = { url: string; title: string };

export type ChatResponse = {
  status: AnswerStatus;
  answer: string;
  sources: SourceRef[];
  contactUrl: string | null;
  offerLeadForm: boolean;
};
