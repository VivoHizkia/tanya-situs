import * as cheerio from "cheerio";
import type { ExtractedPage, Section } from "@/lib/types";

// Turns the HTML of any site into sections of text: each heading starts a section and the
// lines under it belong to it. Menus, footers, forms and scripts are dropped, because they
// repeat on every page and would crowd out the real content in search results.

const REMOVE =
  "script, style, noscript, template, svg, iframe, nav, footer, aside, form, button, select, [aria-hidden=true], [hidden]";

const HEADINGS = new Set(["h1", "h2", "h3", "h4"]);

// Elements that start a new line. Text inside any other element (a, span, strong...) stays on
// the line it sits in.
const BLOCK = new Set(
  (
    "address article blockquote br caption dd details div dl dt figcaption figure header hr li " +
    "main ol p pre section summary table tbody tfoot thead tr ul"
  ).split(" "),
);

// Table cells are joined with " | " so that a price stays on the same line as its item.
const CELL = new Set(["td", "th"]);

const MAX_LINE_CHARS = 1000;

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

export function extractPage(html: string): ExtractedPage {
  const $ = cheerio.load(html);

  const title =
    clean($("meta[property='og:title']").attr("content") ?? "") ||
    clean($("title").first().text()) ||
    clean($("h1").first().text());
  const language = ($("html").attr("lang") ?? "").trim().slice(0, 2).toLowerCase() || null;
  // The description is often the best one-line summary of a business, and it is not in <body>.
  const description = clean($("meta[name='description']").attr("content") ?? "");

  $(REMOVE).remove();
  let root = $("main, [role=main], article").first();
  if (root.length === 0) root = $("body");

  const sections: Section[] = [];
  let current: Section = { heading: title || "Page", lines: description ? [description] : [] };
  let line = "";

  const endLine = () => {
    const text = clean(line).slice(0, MAX_LINE_CHARS);
    // The same sentence repeated (carousels, mobile and desktop copies) adds nothing.
    if (text && !current.lines.includes(text)) current.lines.push(text);
    line = "";
  };
  const endSection = (heading: string) => {
    endLine();
    if (current.lines.length > 0) sections.push(current);
    current = { heading, lines: [] };
  };

  const walk = (node: cheerio.Cheerio<any>) => {
    node.contents().each((_, child) => {
      if (child.type === "text") {
        line += child.data;
        return;
      }
      if (child.type !== "tag") return;
      const name = child.name.toLowerCase();

      if (HEADINGS.has(name)) {
        const heading = clean($(child).text());
        if (heading) endSection(heading);
        return;
      }
      // An image's description is content too ("Menu: nasi goreng Rp 25.000").
      if (name === "img") {
        const alt = clean($(child).attr("alt") ?? "");
        if (alt.length > 15) line += ` ${alt} `;
        return;
      }

      const block = BLOCK.has(name);
      if (block) endLine();
      if (CELL.has(name) && clean(line)) line += " | ";
      walk($(child));
      if (block) endLine();
    });
  };
  walk(root);
  endSection("");

  return { title: title || "Untitled page", language, sections };
}

// Same-site links found on a page, offered to the owner as pages they may want to add.
export function findSiteLinks(html: string, pageUrl: string, limit = 30): string[] {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const found = new Set<string>();

  $("a[href]").each((_, anchor) => {
    try {
      const url = new URL($(anchor).attr("href") ?? "", base);
      url.hash = "";
      url.search = "";
      const isPage = !/\.(jpe?g|png|gif|webp|svg|pdf|zip|docx?|xlsx?|mp4|mp3)$/i.test(url.pathname);
      if (url.origin === base.origin && isPage) found.add(url.toString());
    } catch {
      // Not a link we can use (mailto:, javascript:, broken).
    }
  });
  found.delete(new URL(base.pathname, base.origin).toString());
  // Shorter paths first: "/harga" is more likely to matter than a deep blog post.
  return [...found].sort((a, b) => a.length - b.length).slice(0, limit);
}
