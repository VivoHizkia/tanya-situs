import type { Chunk } from "@/lib/types";

// Plain BM25 keyword search. A bot has at most a few thousand chunks, so the index is built in
// memory for each question: no embedding service to pay for, and a hit can always be explained
// by the words it matched. Questions are rewritten into the language of the pages before they
// get here (see the planner prompt).

const STOPWORDS = new Set(
  // English
  (
    "a an the and or of to in on for with at by from is are was were be been it its this that " +
    "these those what which who whom how much many does do did can could should would will " +
    "i you me my your we our us they them their there here as about into than then so if not no " +
    // Indonesian
    "yang dan di ke dari untuk dengan pada adalah ini itu atau juga akan saya kami kita anda " +
    "kamu mereka apa apakah bagaimana berapa ada tidak bisa dapat sudah oleh dalam sebagai nya"
  ).split(" "),
);

// Standard BM25 parameters: K1 controls term-frequency saturation, B length normalisation.
const K1 = 1.4;
const B = 0.75;

// Removes thousands separators so "18,995", "18.995" and "18995" are one token.
// The lookahead requires exactly three digits after the separator, which keeps decimals such as
// "4.5" intact and still works when letters follow the number ("3,950USD").
export function normalizeNumber(text: string): string {
  return text.replace(/(?<=\d)[,.](?=\d{3}(?!\d))/g, "");
}

// Very light stemming: "packages" -> "package". Words ending in "ss" are left alone.
function singular(word: string): string {
  const isPlural = word.length > 4 && word.endsWith("s") && !word.endsWith("ss");
  return isPlural ? word.slice(0, -1) : word;
}

export function tokenize(text: string): string[] {
  return (
    normalizeNumber(text.toLowerCase())
      // Letters and digits of any alphabet are kept; accents are part of the letter.
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((word) => word.length > 1 && !STOPWORDS.has(word))
      .map(singular)
  );
}

export type Hit = { chunk: Chunk; score: number };

type Doc = { chunk: Chunk; termCounts: Map<string, number>; length: number };

export class Bm25Index {
  private readonly docs: Doc[];
  // How many chunks contain each term.
  private readonly docFrequency = new Map<string, number>();
  private readonly averageLength: number;

  constructor(chunks: Chunk[]) {
    this.docs = chunks.map((chunk) => {
      // The section heading is counted twice so that a match in the heading outranks a
      // passing mention in the body text.
      const tokens = tokenize(`${chunk.pageTitle} ${chunk.section} ${chunk.section} ${chunk.text}`);

      const termCounts = new Map<string, number>();
      for (const token of tokens) {
        termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
      }
      for (const term of termCounts.keys()) {
        this.docFrequency.set(term, (this.docFrequency.get(term) ?? 0) + 1);
      }
      return { chunk, termCounts, length: tokens.length };
    });

    const totalLength = this.docs.reduce((sum, doc) => sum + doc.length, 0);
    this.averageLength = Math.max(totalLength / Math.max(this.docs.length, 1), 1);
  }

  search(query: string, limit = 6): Hit[] {
    const terms = [...new Set(tokenize(query))];

    return this.docs
      .map((doc) => ({ chunk: doc.chunk, score: this.score(doc, terms) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private score(doc: Doc, terms: string[]): number {
    const lengthRatio = doc.length / this.averageLength;
    let score = 0;

    for (const term of terms) {
      const count = doc.termCounts.get(term);
      if (!count) continue;
      score += this.idf(term) * ((count * (K1 + 1)) / (count + K1 * (1 - B + B * lengthRatio)));
    }
    return score;
  }

  // Rare terms weigh more than terms that appear in most chunks.
  private idf(term: string): number {
    const containing = this.docFrequency.get(term) ?? 0;
    return Math.log(1 + (this.docs.length - containing + 0.5) / (containing + 0.5));
  }
}
