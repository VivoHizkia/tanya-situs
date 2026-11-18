import { normalizeNumber } from "@/lib/retrieval/bm25";
import type { Chunk } from "@/lib/types";

// Three ways a price can show up in an answer:
//   Rp 150.000 / $18,995 / USD 2,600 / €500      currency in front
//   150.000 rupiah / 3,950 dollars / 500 euros   currency behind
//   18,995                                       no currency, but written with a thousands separator
const CURRENCY_FIRST =
  /(?:Rp\.?|IDR|US\$|S\$|RM|\$|€|£|USD|EUR|SGD|MYR)\s?\d[\d.,]*\d|(?:Rp\.?|\$|€|£)\s?\d/;
const CURRENCY_LAST =
  /\b\d[\d.,]*\d?\s?(?:rupiah|IDR|USD|US dollars|dollars|EUR|euros?|SGD|ringgit|MYR)\b/;
const THOUSANDS_ONLY = /\b\d{1,3}(?:[.,]\d{3})+\b/;

const MONEY = new RegExp(
  [CURRENCY_FIRST, CURRENCY_LAST, THOUSANDS_ONLY].map((re) => re.source).join("|"),
  "gi",
);

// "Rp 150.000" -> "150000", "$18,995.00" -> "18995", "$4.50" -> "4.50"
function toPlainNumber(amount: string): string {
  const normalized = normalizeNumber(amount.replace(/\s/g, ""));
  const value = normalized.match(/\d+(?:[.,]\d{1,2})?/)?.[0] ?? "";
  return value.replace(/[.,]00?$/, "").replace(",", ".");
}

export function moneyAmounts(text: string): string[] {
  const amounts = (text.match(MONEY) ?? []).map(toPlainNumber).filter(Boolean);
  return [...new Set(amounts)];
}

function numbersIn(text: string): Set<string> {
  const numbers = normalizeNumber(text).match(/\d+(?:[.,]\d{1,2})?/g) ?? [];
  return new Set(numbers.map((n) => n.replace(/[.,]00?$/, "").replace(",", ".")));
}

export type PriceCheck =
  { ok: true; extraSourceIds: string[] } | { ok: false; unsupported: string[] };

// Every price in the answer has to appear in one of the retrieved passages.
//
// If one does not, the whole answer is rejected (`ok: false`) and the caller falls back to
// "I couldn't find that". If a price is found in a passage the model did not cite, that
// passage is returned in `extraSourceIds` so the visitor still gets a link to check it.
//
// Known limits: this compares numbers only. It cannot tell that a correct number was attached
// to the wrong product, and a price the model reworded ("1,5 juta" for "Rp 1.500.000") is
// rejected even though it is right. Rejecting a correct answer costs one lead form; passing a
// wrong price costs the business a customer's trust, so the check errs on the strict side.
export function checkPrices(answer: string, retrieved: Chunk[], citedIds: Set<string>): PriceCheck {
  // The section heading counts too: the model sees it, and some prices appear only there.
  const passages = retrieved.map((chunk) => ({
    id: chunk.id,
    numbers: numbersIn(`${chunk.section}\n${chunk.text}`),
  }));
  const unsupported: string[] = [];
  const extraSourceIds = new Set<string>();

  for (const amount of moneyAmounts(answer)) {
    const holders = passages.filter((p) => p.numbers.has(amount)).map((p) => p.id);
    if (holders.length === 0) {
      unsupported.push(amount);
    } else if (!holders.some((id) => citedIds.has(id))) {
      extraSourceIds.add(holders[0]);
    }
  }

  if (unsupported.length > 0) return { ok: false, unsupported };
  return { ok: true, extraSourceIds: [...extraSourceIds] };
}

// Indonesian mobile numbers as people write them: 0813 1783 862, +62 813-1783-862, 6281317838 62.
const PHONE = /(?<![\d+])(?:\+?62|0)\s?8\d{1,3}(?:[\s.-]?\d{2,4}){2,3}(?!\d)/g;

// "0813 1783 862" and "+62 813-1783-862" both become "628131783862".
export function normalizePhone(text: string): string {
  const digits = text.replace(/\D/g, "");
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

export function phoneNumbers(text: string): string[] {
  return [...new Set((text.match(PHONE) ?? []).map(normalizePhone))];
}

// Every phone number in the answer has to appear in one of the retrieved passages. A wrong
// number sends a customer to a stranger, so an answer with one is rejected outright.
export function checkPhones(
  answer: string,
  retrieved: Chunk[],
): { ok: boolean; unsupported: string[] } {
  const known = new Set(
    retrieved.flatMap((chunk) => phoneNumbers(`${chunk.section}\n${chunk.text}`)),
  );
  const unsupported = phoneNumbers(answer).filter((phone) => !known.has(phone));
  return { ok: unsupported.length === 0, unsupported };
}
