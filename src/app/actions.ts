"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  DUMMY_HASH,
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "@/lib/auth/password";
import { endSession, requireAccount, startSession } from "@/lib/auth/session";
import { findSiteLinks } from "@/lib/crawl/extract";
import { fetchPage } from "@/lib/crawl/fetch";
import { parsePublicUrl, UnsafeUrlError } from "@/lib/crawl/safe-url";
import { getDb } from "@/lib/db/client";
import { readPage } from "@/lib/ingest";
import { limitsFor } from "@/lib/limits";
import { allowRequest } from "@/lib/rate-limit";
import {
  countBots,
  countPages,
  createAccount,
  createBot,
  deleteBot,
  deletePage,
  findLogin,
  findOwnedBot,
  hasPage,
  listPages,
  updateBot,
} from "@/lib/store";
import { defaultWelcome, SUPPORTED_LANGUAGES } from "@/lib/strings";
import type { Page } from "@/lib/types";
import { contactLink, emailField, textField } from "@/lib/validate";

// Server actions are public HTTP endpoints. Each one that touches a customer's data starts
// with requireAccount() and reaches the data through findOwnedBot(), never by bot id alone.

export type FormState = { error?: string; ok?: boolean };

async function clientIp(): Promise<string> {
  const list = await headers();
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "local";
}

const signupsOpen = () => process.env.SIGNUPS_OPEN !== "false";

// --- Accounts ----------------------------------------------------------------

export async function signupAction(_previous: FormState, form: FormData): Promise<FormState> {
  if (!signupsOpen()) return { error: "New accounts are closed at the moment." };
  if (!allowRequest(`signup:${await clientIp()}`, 5)) {
    return { error: "Too many attempts. Please wait a minute." };
  }

  const email = emailField(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!email) return { error: "Enter a valid email address." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) return { error: "That password is too long." };

  const account = await createAccount(await getDb(), email, await hashPassword(password));
  if (!account) return { error: "An account with that email already exists. Log in instead." };

  await startSession(account.id);
  redirect("/dashboard");
}

export async function loginAction(_previous: FormState, form: FormData): Promise<FormState> {
  const email = emailField(form.get("email"));
  const password = String(form.get("password") ?? "").slice(0, MAX_PASSWORD_LENGTH);

  // Limited per address and per email, so neither one account nor one visitor can be hammered.
  const ip = await clientIp();
  if (!allowRequest(`login:${ip}`, 10) || !allowRequest(`login:${email ?? ""}`, 10)) {
    return { error: "Too many attempts. Please wait a minute." };
  }

  const found = email ? await findLogin(await getDb(), email) : null;
  const valid = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);
  // One message for both cases, so the form does not reveal which emails are registered.
  if (!found || !valid) return { error: "Wrong email or password." };

  await startSession(found.account.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}

// --- Bots --------------------------------------------------------------------

const isLanguage = (code: string) => SUPPORTED_LANGUAGES.some((language) => language.code === code);

export async function createBotAction(_previous: FormState, form: FormData): Promise<FormState> {
  const account = await requireAccount();
  const db = await getDb();

  const name = textField(form.get("name"), 80);
  if (!name) return { error: "Enter the name of the business." };

  let site: string;
  try {
    site = parsePublicUrl(String(form.get("site") ?? "")).toString();
  } catch (err) {
    return { error: err instanceof UnsafeUrlError ? err.message : "Enter the site address." };
  }

  const limits = limitsFor(account.plan);
  if ((await countBots(db, account.id)) >= limits.bots) {
    return { error: `Your plan includes ${limits.bots} chatbot(s). Upgrade to add more.` };
  }
  if (!allowRequest(`crawl:${account.id}`, 30)) {
    return { error: "Too many pages at once. Please wait a minute." };
  }

  const bot = await createBot(db, account.id, {
    name,
    language: "en",
    welcome: defaultWelcome("en", name),
    contactUrl: null,
  });

  // The home page is read straight away: it tells us the site's language, and the owner
  // lands on a bot that already knows something.
  const { language } = await readPage(db, bot.id, site);
  if (language && language !== "en" && isLanguage(language)) {
    await updateBot(db, account.id, bot.id, {
      name,
      language,
      welcome: defaultWelcome(language, name),
      contactUrl: null,
    });
  }
  redirect(`/dashboard/${bot.id}`);
}

export async function updateBotAction(_previous: FormState, form: FormData): Promise<FormState> {
  const account = await requireAccount();
  const botId = String(form.get("botId") ?? "");

  const name = textField(form.get("name"), 80);
  const welcome = textField(form.get("welcome"), 300);
  const language = textField(form.get("language"), 5);
  const contactUrl = contactLink(form.get("contactUrl"));

  if (!name || !welcome) return { error: "The name and the welcome message cannot be empty." };
  if (!isLanguage(language)) return { error: "Choose one of the listed languages." };
  if (contactUrl === undefined) {
    return {
      error:
        "The contact link must start with https://, mailto: or tel: (for WhatsApp use https://wa.me/...).",
    };
  }

  const saved = await updateBot(await getDb(), account.id, botId, {
    name,
    language,
    welcome,
    contactUrl,
  });
  if (!saved) return { error: "That chatbot was not found." };

  revalidatePath(`/dashboard/${botId}`);
  return { ok: true };
}

export async function deleteBotAction(form: FormData): Promise<void> {
  const account = await requireAccount();
  await deleteBot(await getDb(), account.id, String(form.get("botId") ?? ""));
  redirect("/dashboard");
}

// --- Pages -------------------------------------------------------------------

export type PageActionResult = { page?: Page; error?: string };

// Adds a page, or reads it again if it was already added.
export async function readPageAction(botId: string, rawUrl: string): Promise<PageActionResult> {
  const account = await requireAccount();
  const db = await getDb();
  const bot = await findOwnedBot(db, account.id, botId);
  if (!bot) return { error: "That chatbot was not found." };

  let url: string;
  try {
    url = parsePublicUrl(rawUrl).toString();
  } catch (err) {
    return { error: err instanceof UnsafeUrlError ? err.message : "Enter a page address." };
  }

  const limits = limitsFor(account.plan);
  const isNew = !(await hasPage(db, bot.id, url));
  if (isNew && (await countPages(db, bot.id)) >= limits.pagesPerBot) {
    return { error: `Your plan includes ${limits.pagesPerBot} pages per chatbot.` };
  }
  if (!allowRequest(`crawl:${account.id}`, 30)) {
    return { error: "Too many pages at once. Please wait a minute." };
  }

  const { page } = await readPage(db, bot.id, url);
  revalidatePath(`/dashboard/${botId}`);
  return { page };
}

export async function deletePageAction(botId: string, pageId: string): Promise<void> {
  const account = await requireAccount();
  const db = await getDb();
  const bot = await findOwnedBot(db, account.id, botId);
  if (!bot) return;
  await deletePage(db, bot.id, pageId);
  revalidatePath(`/dashboard/${botId}`);
}

// Looks at the first page of the bot for links to other pages of the same site that have not
// been added yet.
export async function suggestPagesAction(
  botId: string,
): Promise<{ urls: string[]; error?: string }> {
  const account = await requireAccount();
  const db = await getDb();
  const bot = await findOwnedBot(db, account.id, botId);
  if (!bot) return { urls: [], error: "That chatbot was not found." };

  const pages = await listPages(db, bot.id);
  if (pages.length === 0) return { urls: [], error: "Add your home page first." };
  if (!allowRequest(`crawl:${account.id}`, 30)) {
    return { urls: [], error: "Too many pages at once. Please wait a minute." };
  }

  // The shortest address is the closest thing to a home page.
  const home = pages.reduce((a, b) => (a.url.length <= b.url.length ? a : b));
  const fetched = await fetchPage(home.url);
  if (fetched.status !== "ok") return { urls: [], error: "Your site could not be read just now." };

  const known = new Set(pages.map((page) => page.url));
  const urls = findSiteLinks(fetched.html, fetched.finalUrl).filter((url) => !known.has(url));
  return { urls: urls.slice(0, 20) };
}
