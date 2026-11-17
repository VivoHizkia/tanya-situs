import { describe, expect, it } from "vitest";
import { checkPrices, moneyAmounts } from "@/lib/chat/guardrails";
import { Bm25Index, normalizeNumber, tokenize } from "@/lib/retrieval/bm25";
import { chunk } from "./helpers";

describe("tokenize", () => {
  it("treats a number written three ways as one token", () => {
    expect(tokenize("Rp 350.000")).toEqual(tokenize("Rp 350,000"));
    expect(tokenize("350.000")).toEqual(["350000"]);
  });

  it("keeps decimals", () => {
    expect(normalizeNumber("4.5 km")).toBe("4.5 km");
  });

  it("drops English and Indonesian stopwords", () => {
    expect(tokenize("berapa harga scaling di klinik")).toEqual(["harga", "scaling", "klinik"]);
    expect(tokenize("what is the price")).toEqual(["price"]);
  });

  it("keeps accented and non-Latin letters", () => {
    expect(tokenize("café señor 東京")).toEqual(["café", "señor", "東京"]);
  });
});

describe("Bm25Index", () => {
  const index = new Bm25Index([
    chunk("a", "Perawatan", "Scaling Rp 350.000. Tambal gigi Rp 250.000."),
    chunk("b", "Jam Buka", "Senin sampai Sabtu, 09.00 sampai 20.00."),
    chunk("c", "Lokasi", "Jalan Merdeka 10, Bandung. Parkir tersedia."),
  ]);

  it("ranks the passage that contains the words first", () => {
    expect(index.search("harga scaling")[0].chunk.id).toBe("a");
    expect(index.search("parkir")[0].chunk.id).toBe("c");
  });

  it("weighs a match in the heading above a match in the body", () => {
    const tie = new Bm25Index([
      chunk("x", "Lainnya", "Info jam buka ada di halaman lain, silakan lihat."),
      chunk("y", "Jam Buka", "Setiap hari kecuali hari libur nasional, silakan datang."),
    ]);
    expect(tie.search("jam buka")[0].chunk.id).toBe("y");
  });

  it("returns nothing when no word matches", () => {
    expect(index.search("pizza")).toEqual([]);
  });

  it("copes with a bot that has no pages yet", () => {
    expect(new Bm25Index([]).search("apa saja")).toEqual([]);
  });
});

describe("moneyAmounts", () => {
  it.each([
    ["Rp 350.000", ["350000"]],
    ["Rp350.000,00", ["350000"]],
    ["350.000 rupiah", ["350000"]],
    ["$18,995 or US$ 30,000", ["18995", "30000"]],
    ["only $5 today", ["5"]],
    ["4.50 USD", ["4.50"]],
    ["sekitar 1.250.000 per bulan", ["1250000"]],
  ])("finds the amounts in %s", (text, expected) => {
    expect(moneyAmounts(text)).toEqual(expected);
  });

  it("ignores numbers that are not prices", () => {
    expect(moneyAmounts("Buka 09.00 sampai 20.00, 6 hari, telp 0812 3456 789")).toEqual([]);
  });
});

describe("checkPrices", () => {
  const passages = [
    chunk("a", "Perawatan", "Scaling Rp 350.000. Tambal gigi Rp 250.000."),
    chunk("b", "Paket Hemat (Rp 500.000)", "Scaling dan tambal dalam satu kunjungan."),
  ];

  it("accepts a price that is in a cited passage", () => {
    expect(checkPrices("Scaling Rp 350.000.", passages, new Set(["a"]))).toEqual({
      ok: true,
      extraSourceIds: [],
    });
  });

  it("rejects a price that is in no passage", () => {
    expect(checkPrices("Scaling Rp 300.000.", passages, new Set(["a"]))).toEqual({
      ok: false,
      unsupported: ["300000"],
    });
  });

  it("adds the passage that holds a price the model did not cite", () => {
    expect(checkPrices("Tambal gigi Rp 250.000.", passages, new Set(["b"]))).toEqual({
      ok: true,
      extraSourceIds: ["a"],
    });
  });

  it("finds a price that only appears in a section heading", () => {
    expect(checkPrices("Paket hemat Rp 500.000.", passages, new Set(["b"])).ok).toBe(true);
  });

  it("accepts an answer with no price in it", () => {
    expect(checkPrices("Kami buka setiap hari.", passages, new Set()).ok).toBe(true);
  });
});
