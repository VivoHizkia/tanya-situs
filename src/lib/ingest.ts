import { chunkSections } from "./crawl/chunk";
import { extractPage } from "./crawl/extract";
import { fetchPage, type HttpGet } from "./crawl/fetch";
import type { Db } from "./db/client";
import { savePage } from "./store";
import type { Page } from "./types";

export type ReadOutcome = { page: Page; language: string | null; html: string | null };

// Reads one page and stores what was found, whatever the outcome: a page that is blocked or
// broken is saved with its reason, so the owner sees why it is not being used.
export async function readPage(
  db: Db,
  botId: string,
  url: string,
  get?: HttpGet,
): Promise<ReadOutcome> {
  const fetched = await fetchPage(url, get);

  if (fetched.status === "blocked") {
    const page = await savePage(db, botId, url, {
      status: "blocked",
      error: "The site's robots.txt does not allow this page to be read.",
    });
    return { page, language: null, html: null };
  }
  if (fetched.status === "failed") {
    const page = await savePage(db, botId, url, { status: "failed", error: fetched.error });
    return { page, language: null, html: null };
  }

  const extracted = extractPage(fetched.html);
  const chunks = chunkSections(extracted.sections);
  if (chunks.length === 0) {
    const page = await savePage(db, botId, url, {
      status: "failed",
      // The usual cause: the page builds its content with JavaScript, which is not run here.
      error: "No readable text was found. The page may only show its content with JavaScript.",
    });
    return { page, language: extracted.language, html: fetched.html };
  }

  const page = await savePage(db, botId, url, { status: "ok", title: extracted.title, chunks });
  return { page, language: extracted.language, html: fetched.html };
}
