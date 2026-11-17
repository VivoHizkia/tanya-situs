// Checks for text typed into forms. Each returns the cleaned value or null.

export function textField(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// Loose on purpose: it only needs to catch obvious typos.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailField(value: unknown): string | null {
  const email = textField(value, 200).toLowerCase();
  return EMAIL.test(email) ? email : null;
}

// An email address or a phone number, as a visitor would leave in the chat.
export function contactField(value: unknown): string | null {
  const contact = textField(value, 200);
  const digits = contact.replace(/\D/g, "");
  const isPhone = /^[+\d][\d\s().-]+$/.test(contact) && digits.length >= 7 && digits.length <= 15;
  return EMAIL.test(contact) || isPhone ? contact : null;
}

// The owner's "contact us" link is rendered as a link in other people's browsers, so only
// schemes that cannot run script are accepted. Returns undefined when the value is not usable.
export function contactLink(value: unknown): string | null | undefined {
  const text = textField(value, 500);
  if (!text) return null;
  try {
    const url = new URL(text);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
