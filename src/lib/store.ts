import { randomBytes, randomUUID } from "node:crypto";
import type { Db } from "./db/client";
import type { Account, Bot, Chunk, Lead, Page, PageStatus, PlanName, Unanswered } from "./types";

// Every SQL statement in the app lives here.
//
// Rule for anything an account owner can read or change: the function takes the account id and
// puts it in the WHERE clause. Callers never check ownership themselves, so a forgotten check
// cannot expose another customer's data.

const iso = (value: unknown): string => new Date(value as string | Date).toISOString();

// Short, URL-safe and unguessable. Used for the public bot id.
const publicId = () => randomBytes(9).toString("base64url");

// --- Accounts and sessions ---------------------------------------------------

type AccountRow = { id: string; email: string; plan: string; password_hash: string };

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  email: row.email,
  plan: row.plan as PlanName,
});

// Returns null when the email is already registered.
export async function createAccount(
  db: Db,
  email: string,
  passwordHash: string,
): Promise<Account | null> {
  const rows = await db.query<AccountRow>(
    `INSERT INTO accounts (id, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, plan, password_hash`,
    [randomUUID(), email, passwordHash],
  );
  return rows[0] ? toAccount(rows[0]) : null;
}

export async function findLogin(
  db: Db,
  email: string,
): Promise<{ account: Account; passwordHash: string } | null> {
  const rows = await db.query<AccountRow>(
    "SELECT id, email, plan, password_hash FROM accounts WHERE email = $1",
    [email],
  );
  return rows[0] ? { account: toAccount(rows[0]), passwordHash: rows[0].password_hash } : null;
}

export async function setPlan(db: Db, email: string, plan: PlanName): Promise<boolean> {
  const rows = await db.query("UPDATE accounts SET plan = $2 WHERE email = $1 RETURNING id", [
    email,
    plan,
  ]);
  return rows.length > 0;
}

export async function createSession(
  db: Db,
  tokenHash: string,
  accountId: string,
  expiresAt: Date,
): Promise<void> {
  await db.query("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)", [
    tokenHash,
    accountId,
    expiresAt.toISOString(),
  ]);
  // Opportunistic clean-up, so expired rows do not pile up without a scheduled job.
  await db.query("DELETE FROM sessions WHERE expires_at < now()");
}

export async function findSessionAccount(db: Db, tokenHash: string): Promise<Account | null> {
  const rows = await db.query<AccountRow>(
    `SELECT a.id, a.email, a.plan, a.password_hash
       FROM sessions s JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ? toAccount(rows[0]) : null;
}

export async function deleteSession(db: Db, tokenHash: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
}

// --- Bots --------------------------------------------------------------------

type BotRow = {
  id: string;
  account_id: string;
  name: string;
  language: string;
  welcome: string;
  contact_url: string | null;
};

const BOT_COLUMNS = "id, account_id, name, language, welcome, contact_url";

const toBot = (row: BotRow): Bot => ({
  id: row.id,
  accountId: row.account_id,
  name: row.name,
  language: row.language,
  welcome: row.welcome,
  contactUrl: row.contact_url,
});

export type BotSettings = {
  name: string;
  language: string;
  welcome: string;
  contactUrl: string | null;
};

export async function createBot(db: Db, accountId: string, settings: BotSettings): Promise<Bot> {
  const rows = await db.query<BotRow>(
    `INSERT INTO bots (id, account_id, name, language, welcome, contact_url)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${BOT_COLUMNS}`,
    [
      publicId(),
      accountId,
      settings.name,
      settings.language,
      settings.welcome,
      settings.contactUrl,
    ],
  );
  return toBot(rows[0]);
}

export async function listBots(db: Db, accountId: string): Promise<Bot[]> {
  const rows = await db.query<BotRow>(
    `SELECT ${BOT_COLUMNS} FROM bots WHERE account_id = $1 ORDER BY created_at`,
    [accountId],
  );
  return rows.map(toBot);
}

export async function countBots(db: Db, accountId: string): Promise<number> {
  const rows = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM bots WHERE account_id = $1",
    [accountId],
  );
  return rows[0].n;
}

// For the dashboard: only the owner's bot is returned.
export async function findOwnedBot(db: Db, accountId: string, botId: string): Promise<Bot | null> {
  const rows = await db.query<BotRow>(
    `SELECT ${BOT_COLUMNS} FROM bots WHERE id = $1 AND account_id = $2`,
    [botId, accountId],
  );
  return rows[0] ? toBot(rows[0]) : null;
}

// For the public chat: any visitor may talk to a bot whose id they have. The owner's plan
// comes along so the quota can be checked without a second query.
export async function findPublicBot(
  db: Db,
  botId: string,
): Promise<{ bot: Bot; plan: string } | null> {
  const rows = await db.query<BotRow & { plan: string }>(
    `SELECT b.id, b.account_id, b.name, b.language, b.welcome, b.contact_url, a.plan
       FROM bots b JOIN accounts a ON a.id = b.account_id
      WHERE b.id = $1`,
    [botId],
  );
  return rows[0] ? { bot: toBot(rows[0]), plan: rows[0].plan } : null;
}

export async function updateBot(
  db: Db,
  accountId: string,
  botId: string,
  settings: BotSettings,
): Promise<boolean> {
  const rows = await db.query(
    `UPDATE bots SET name = $3, language = $4, welcome = $5, contact_url = $6
      WHERE id = $1 AND account_id = $2 RETURNING id`,
    [botId, accountId, settings.name, settings.language, settings.welcome, settings.contactUrl],
  );
  return rows.length > 0;
}

export async function deleteBot(db: Db, accountId: string, botId: string): Promise<boolean> {
  const rows = await db.query("DELETE FROM bots WHERE id = $1 AND account_id = $2 RETURNING id", [
    botId,
    accountId,
  ]);
  return rows.length > 0;
}

// --- Pages and chunks --------------------------------------------------------

type PageRow = {
  id: string;
  bot_id: string;
  url: string;
  title: string;
  status: string;
  error: string | null;
  chunk_count: number;
  fetched_at: string | Date;
};

const toPage = (row: PageRow): Page => ({
  id: row.id,
  botId: row.bot_id,
  url: row.url,
  title: row.title,
  status: row.status as PageStatus,
  error: row.error,
  chunkCount: row.chunk_count,
  fetchedAt: iso(row.fetched_at),
});

// The functions below take a bot id only. Callers reach them after findOwnedBot, which is
// where ownership is checked.

export async function listPages(db: Db, botId: string): Promise<Page[]> {
  const rows = await db.query<PageRow>("SELECT * FROM pages WHERE bot_id = $1 ORDER BY url", [
    botId,
  ]);
  return rows.map(toPage);
}

export async function countPages(db: Db, botId: string): Promise<number> {
  const rows = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM pages WHERE bot_id = $1",
    [botId],
  );
  return rows[0].n;
}

export async function hasPage(db: Db, botId: string, url: string): Promise<boolean> {
  const rows = await db.query("SELECT 1 FROM pages WHERE bot_id = $1 AND url = $2", [botId, url]);
  return rows.length > 0;
}

export type PageResult =
  | { status: "ok"; title: string; chunks: { section: string; text: string }[] }
  | { status: "blocked" | "failed"; error: string };

// Stores the outcome of reading one page.
//
// A page that was read before and now fails keeps its old chunks: a server hiccup during a
// refresh must not make the bot forget what it knew. The row then shows the error next to the
// content that is still being used.
export async function savePage(
  db: Db,
  botId: string,
  url: string,
  result: PageResult,
): Promise<Page> {
  if (result.status !== "ok") {
    const rows = await db.query<PageRow>(
      `INSERT INTO pages (id, bot_id, url, status, error) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (bot_id, url) DO UPDATE SET error = EXCLUDED.error, fetched_at = now(),
         status = CASE WHEN pages.chunk_count > 0 THEN pages.status ELSE EXCLUDED.status END
       RETURNING *`,
      [randomUUID(), botId, url, result.status, result.error],
    );
    return toPage(rows[0]);
  }

  const rows = await db.query<PageRow>(
    `INSERT INTO pages (id, bot_id, url, title, status, error, chunk_count)
     VALUES ($1, $2, $3, $4, 'ok', NULL, $5)
     ON CONFLICT (bot_id, url) DO UPDATE SET title = EXCLUDED.title, status = 'ok',
       error = NULL, chunk_count = EXCLUDED.chunk_count, fetched_at = now()
     RETURNING *`,
    [randomUUID(), botId, url, result.title, result.chunks.length],
  );
  const page = toPage(rows[0]);

  await db.query("DELETE FROM chunks WHERE page_id = $1", [page.id]);
  for (const [position, chunk] of result.chunks.entries()) {
    await db.query(
      `INSERT INTO chunks (id, page_id, bot_id, position, section, body)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      // Short ids: the model has to copy them back as "source_ids".
      [randomBytes(6).toString("hex"), page.id, botId, position, chunk.section, chunk.text],
    );
  }
  return page;
}

export async function deletePage(db: Db, botId: string, pageId: string): Promise<void> {
  await db.query("DELETE FROM pages WHERE id = $1 AND bot_id = $2", [pageId, botId]);
}

export async function loadChunks(db: Db, botId: string): Promise<Chunk[]> {
  const rows = await db.query<{
    id: string;
    url: string;
    title: string;
    section: string;
    body: string;
  }>(
    `SELECT c.id, p.url, p.title, c.section, c.body
       FROM chunks c JOIN pages p ON p.id = c.page_id
      WHERE c.bot_id = $1 ORDER BY p.url, c.position`,
    [botId],
  );
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    pageTitle: row.title,
    section: row.section,
    text: row.body,
  }));
}

// --- Usage -------------------------------------------------------------------

// Counts one message and returns the new total for the month, in one statement so two
// simultaneous requests cannot both read the same old value.
export async function countMessage(db: Db, accountId: string, month: string): Promise<number> {
  const rows = await db.query<{ messages: number }>(
    `INSERT INTO usage (account_id, month, messages) VALUES ($1, $2, 1)
     ON CONFLICT (account_id, month) DO UPDATE SET messages = usage.messages + 1
     RETURNING messages`,
    [accountId, month],
  );
  return rows[0].messages;
}

export async function messagesUsed(db: Db, accountId: string, month: string): Promise<number> {
  const rows = await db.query<{ messages: number }>(
    "SELECT messages FROM usage WHERE account_id = $1 AND month = $2",
    [accountId, month],
  );
  return rows[0]?.messages ?? 0;
}

// --- Inbox: leads and unanswered questions -------------------------------------

const INBOX_LIMIT = 100;

export async function addLead(
  db: Db,
  botId: string,
  lead: { name: string; contact: string; question: string },
): Promise<void> {
  await db.query(
    "INSERT INTO leads (id, bot_id, name, contact, question) VALUES ($1, $2, $3, $4, $5)",
    [randomUUID(), botId, lead.name, lead.contact, lead.question],
  );
}

export async function listLeads(db: Db, botId: string): Promise<Lead[]> {
  const rows = await db.query<{
    id: string;
    name: string;
    contact: string;
    question: string;
    created_at: string | Date;
  }>(
    `SELECT id, name, contact, question, created_at FROM leads
      WHERE bot_id = $1 ORDER BY created_at DESC LIMIT ${INBOX_LIMIT}`,
    [botId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    contact: row.contact,
    question: row.question,
    at: iso(row.created_at),
  }));
}

export async function addUnanswered(
  db: Db,
  botId: string,
  question: string,
  reason: string,
): Promise<void> {
  await db.query("INSERT INTO unanswered (id, bot_id, question, reason) VALUES ($1, $2, $3, $4)", [
    randomUUID(),
    botId,
    question,
    reason,
  ]);
}

export async function listUnanswered(db: Db, botId: string): Promise<Unanswered[]> {
  const rows = await db.query<{
    id: string;
    question: string;
    reason: string;
    created_at: string | Date;
  }>(
    `SELECT id, question, reason, created_at FROM unanswered
      WHERE bot_id = $1 ORDER BY created_at DESC LIMIT ${INBOX_LIMIT}`,
    [botId],
  );
  return rows.map((row) => ({
    id: row.id,
    question: row.question,
    reason: row.reason,
    at: iso(row.created_at),
  }));
}
