import type { ReactNode } from "react";

// Turns phone numbers, email addresses and web addresses in a bot answer into links.
// Indonesian mobile numbers open WhatsApp, because that is how customers here reach a business.
// The text is split into strings and <a> elements; nothing is ever rendered as HTML.

const TOKEN =
  /((?:\+?62|0)\s?8\d{1,3}(?:[\s.-]?\d{2,4}){2,3})|([^\s@()<>]+@[^\s@()<>]+\.[a-z]{2,})|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/gi;

function phoneHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.startsWith("0") ? `62${digits.slice(1)}` : digits}`;
}

export function LinkedText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [whole, phone, email, url] = match;
    const start = match.index ?? 0;
    // A number glued to other digits (an order id, a price) is not a phone number.
    if (phone && /\d/.test(text[start - 1] ?? "")) continue;
    if (start > last) parts.push(text.slice(last, start));

    const href = phone ? phoneHref(phone) : email ? `mailto:${email}` : url;
    parts.push(
      <a key={start} href={href} target="_blank" rel="noreferrer nofollow">
        {whole}
      </a>,
    );
    last = start + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
