import type { Section } from "@/lib/types";

const MAX_CHARS = 1200;
const MIN_CHARS = 250;
// A page that turns into more chunks than this is almost always a listing or an archive.
// Keeping the first part bounds storage and the cost of each search.
export const MAX_CHUNKS_PER_PAGE = 60;

export type ChunkDraft = { section: string; text: string };

type Draft = { section: string; lines: string[] };

const textLength = (draft: Draft) => draft.lines.join("\n").length;

// Splits a section on line boundaries once it grows past MAX_CHARS.
function splitSection(heading: string, lines: string[]): Draft[] {
  const parts: Draft[] = [];
  let current: Draft = { section: heading, lines: [] };
  let size = 0;

  for (const line of lines) {
    if (size + line.length > MAX_CHARS && current.lines.length > 0) {
      parts.push(current);
      current = { section: `${heading} (cont.)`, lines: [] };
      size = 0;
    }
    current.lines.push(line);
    size += line.length + 1;
  }
  if (current.lines.length > 0) parts.push(current);
  return parts;
}

// A very short chunk (a heading with one sentence) retrieves badly on its own, so the chunk
// that follows is folded into it, with its heading kept as a label line.
function mergeSmall(drafts: Draft[]): Draft[] {
  const merged: Draft[] = [];
  for (const draft of drafts) {
    const previous = merged[merged.length - 1];
    const canMerge =
      previous !== undefined &&
      textLength(previous) < MIN_CHARS &&
      textLength(previous) + textLength(draft) < MAX_CHARS;

    if (canMerge) {
      previous.lines.push(`${draft.section}:`, ...draft.lines);
    } else {
      merged.push({ section: draft.section, lines: [...draft.lines] });
    }
  }
  return merged;
}

// One chunk per page section, so every passage carries its own heading as context.
export function chunkSections(sections: Section[]): ChunkDraft[] {
  const drafts = sections.flatMap((section) => splitSection(section.heading, section.lines));
  return mergeSmall(drafts)
    .slice(0, MAX_CHUNKS_PER_PAGE)
    .map((draft) => ({ section: draft.section, text: draft.lines.join("\n") }));
}
