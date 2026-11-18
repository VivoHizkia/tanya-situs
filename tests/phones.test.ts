import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { answerQuestion, fixedMessage } from "@/lib/chat/answer";
import { checkPhones, normalizePhone, phoneNumbers } from "@/lib/chat/guardrails";
import { Bm25Index } from "@/lib/retrieval/bm25";
import { LinkedText } from "@/components/LinkedText";
import { chunk, scriptedLlm } from "./helpers";

const contact = chunk(
  "k",
  "Kontak",
  "Customer service WhatsApp 0813 1783 862. Buka 08.00 sampai 20.00.",
);

describe("phoneNumbers", () => {
  it.each([
    ["0813 1783 862", "628131783862"],
    ["+62 813-1783-862", "628131783862"],
    ["62813.1783.862", "628131783862"],
    ["081317838620", "6281317838620"],
  ])("reads %s", (text, expected) => {
    expect(phoneNumbers(`hubungi ${text} ya`)).toEqual([expected]);
  });

  it("ignores prices, opening hours and other numbers", () => {
    expect(
      phoneNumbers("Rp 32.000, buka 08.00 sampai 20.00, kode pos 15143, order 12345678"),
    ).toEqual([]);
  });

  it("normalises the leading zero to the country code", () => {
    expect(normalizePhone("0813-1783-862")).toBe("628131783862");
  });
});

describe("checkPhones", () => {
  it("accepts a number written differently from the page", () => {
    expect(checkPhones("WA kami di +62 813 1783 862", [contact]).ok).toBe(true);
  });

  it("rejects a number that is not on the pages", () => {
    expect(checkPhones("WA kami di 0812 3456 7890", [contact])).toEqual({
      ok: false,
      unsupported: ["6281234567890"],
    });
  });
});

describe("answerQuestion with a phone number", () => {
  const deps = (reply: object) => ({
    llm: scriptedLlm({ language: "id", intent: "content", search_query: "whatsapp kontak" }, reply)
      .llm,
    index: new Bm25Index([contact]),
    business: "Tidy Tide Laundry",
    pageLanguage: "id",
    catalog: "- Tidy Tide Laundry",
    contactUrl: "https://wa.me/628131783862",
  });

  it("keeps an answer whose number is on the page", async () => {
    const response = await answerQuestion(
      deps({ status: "answered", answer: "WhatsApp kami di 0813 1783 862.", source_ids: ["k"] }),
      "nomor wa?",
      [],
    );
    expect(response.status).toBe("answered");
  });

  it("replaces an answer with a made-up number", async () => {
    const response = await answerQuestion(
      deps({ status: "answered", answer: "WhatsApp kami di 0812 0000 1111.", source_ids: ["k"] }),
      "nomor wa?",
      [],
    );
    expect(response.answer).toBe(fixedMessage("notFound", "id"));
  });
});

describe("LinkedText", () => {
  const html = (text: string) => renderToStaticMarkup(createElement(LinkedText, { text }));

  it("links an Indonesian mobile number to WhatsApp", () => {
    expect(html("WA ke 0813 1783 862 ya.")).toBe(
      'WA ke <a href="https://wa.me/628131783862" target="_blank" rel="noreferrer nofollow">0813 1783 862</a> ya.',
    );
  });

  it("links email and web addresses", () => {
    expect(html("Email halo@toko.co.id atau https://toko.co.id/harga.")).toContain(
      'href="mailto:halo@toko.co.id"',
    );
    expect(html("Lihat https://toko.co.id/harga.")).toContain('href="https://toko.co.id/harga"');
  });

  it("escapes everything else", () => {
    expect(html('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("leaves prices and hours alone", () => {
    expect(html("Rp 32.000, buka 08.00 sampai 20.00")).toBe("Rp 32.000, buka 08.00 sampai 20.00");
  });
});
