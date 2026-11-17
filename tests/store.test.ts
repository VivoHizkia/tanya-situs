import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { connectEmbedded, type Db } from "@/lib/db/client";
import { readPage } from "@/lib/ingest";
import { limitsFor, monthKey } from "@/lib/limits";
import {
  addLead,
  addUnanswered,
  countMessage,
  createAccount,
  createBot,
  createSession,
  deleteBot,
  deleteSession,
  findLogin,
  findOwnedBot,
  findPublicBot,
  findSessionAccount,
  listBots,
  listLeads,
  listPages,
  listUnanswered,
  loadChunks,
  messagesUsed,
  savePage,
  setPlan,
  updateBot,
  type BotSettings,
} from "@/lib/store";
import { contactField, contactLink, emailField } from "@/lib/validate";
import type { HttpGet } from "@/lib/crawl/fetch";

// These run against a real Postgres engine (in memory), with the same schema file and the
// same SQL as production.

const SETTINGS: BotSettings = {
  name: "Klinik Gigi Sehat",
  language: "id",
  welcome: "Halo!",
  contactUrl: null,
};

let db: Db;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await connectEmbedded();
  alice = (await createAccount(db, "alice@example.com", "hash-a"))!.id;
  bob = (await createAccount(db, "bob@example.com", "hash-b"))!.id;
});

describe("accounts", () => {
  it("refuses a second account with the same email", async () => {
    expect(await createAccount(db, "alice@example.com", "other")).toBeNull();
  });

  it("finds the stored hash by email", async () => {
    expect((await findLogin(db, "alice@example.com"))?.passwordHash).toBe("hash-a");
    expect(await findLogin(db, "nobody@example.com")).toBeNull();
  });

  it("changes a plan", async () => {
    expect(await setPlan(db, "bob@example.com", "pro")).toBe(true);
    expect((await findLogin(db, "bob@example.com"))?.account.plan).toBe("pro");
    expect(await setPlan(db, "nobody@example.com", "pro")).toBe(false);
  });
});

describe("sessions", () => {
  it("resolves a valid session and forgets it after logout", async () => {
    await createSession(db, "token-1", alice, new Date(Date.now() + 60_000));
    expect((await findSessionAccount(db, "token-1"))?.email).toBe("alice@example.com");

    await deleteSession(db, "token-1");
    expect(await findSessionAccount(db, "token-1")).toBeNull();
  });

  it("ignores an expired session", async () => {
    await createSession(db, "token-old", alice, new Date(Date.now() - 1000));
    expect(await findSessionAccount(db, "token-old")).toBeNull();
  });
});

describe("one customer cannot reach another customer's bot", () => {
  it("hides, protects and keeps apart bots of different accounts", async () => {
    const bot = await createBot(db, alice, SETTINGS);

    expect(await findOwnedBot(db, alice, bot.id)).not.toBeNull();
    expect(await findOwnedBot(db, bob, bot.id)).toBeNull();
    expect(await listBots(db, bob)).toEqual([]);

    expect(await updateBot(db, bob, bot.id, { ...SETTINGS, name: "Diambil alih" })).toBe(false);
    expect(await deleteBot(db, bob, bot.id)).toBe(false);
    expect((await findOwnedBot(db, alice, bot.id))?.name).toBe("Klinik Gigi Sehat");
  });

  it("lets any visitor talk to a bot through its public id", async () => {
    const bot = await createBot(db, bob, SETTINGS);
    expect(await findPublicBot(db, bot.id)).toMatchObject({ plan: "pro", bot: { id: bot.id } });
    expect(await findPublicBot(db, "does-not-exist")).toBeNull();
  });
});

describe("pages", () => {
  const URL = "https://toko.example/harga";
  const good = {
    status: "ok" as const,
    title: "Harga",
    chunks: [
      { section: "Perawatan", text: "Scaling Rp 350.000" },
      { section: "Jam Buka", text: "Senin sampai Sabtu" },
    ],
  };

  it("stores a page with its passages", async () => {
    const bot = await createBot(db, alice, SETTINGS);
    const page = await savePage(db, bot.id, URL, good);

    expect(page).toMatchObject({ status: "ok", title: "Harga", chunkCount: 2, error: null });
    expect(await loadChunks(db, bot.id)).toMatchObject([
      { url: URL, pageTitle: "Harga", section: "Perawatan", text: "Scaling Rp 350.000" },
      { section: "Jam Buka" },
    ]);
  });

  it("replaces the passages when a page is read again", async () => {
    const bot = await createBot(db, alice, SETTINGS);
    await savePage(db, bot.id, URL, good);
    await savePage(db, bot.id, URL, {
      ...good,
      chunks: [{ section: "Baru", text: "Scaling Rp 400.000" }],
    });

    expect(await listPages(db, bot.id)).toHaveLength(1);
    expect((await loadChunks(db, bot.id)).map((c) => c.text)).toEqual(["Scaling Rp 400.000"]);
  });

  it("keeps what it knew when a later read fails", async () => {
    const bot = await createBot(db, alice, SETTINGS);
    await savePage(db, bot.id, URL, good);
    const page = await savePage(db, bot.id, URL, {
      status: "failed",
      error: "The site could not be reached.",
    });

    expect(page).toMatchObject({
      status: "ok",
      chunkCount: 2,
      error: "The site could not be reached.",
    });
    expect(await loadChunks(db, bot.id)).toHaveLength(2);
  });

  it("records a page that could never be read, with the reason", async () => {
    const bot = await createBot(db, alice, SETTINGS);
    const page = await savePage(db, bot.id, URL, { status: "blocked", error: "robots.txt" });

    expect(page).toMatchObject({ status: "blocked", chunkCount: 0, error: "robots.txt" });
    expect(await loadChunks(db, bot.id)).toEqual([]);
  });

  it("deletes pages, passages and inbox with the bot", async () => {
    const bot = await createBot(db, alice, SETTINGS);
    await savePage(db, bot.id, URL, good);
    await addLead(db, bot.id, { name: "Budi", contact: "0812345678", question: "Harga?" });
    await deleteBot(db, alice, bot.id);

    expect(await loadChunks(db, bot.id)).toEqual([]);
    expect(await listLeads(db, bot.id)).toEqual([]);
  });
});

describe("readPage", () => {
  const html = (body: string) =>
    `<html lang="id"><title>Toko</title><body><main>${body}</main></body></html>`;
  const serve =
    (body: string): HttpGet =>
    async (url) => {
      const found = !url.endsWith("/robots.txt");
      const res = new Response(found ? body : "", {
        status: found ? 200 : 404,
        headers: { "content-type": "text/html" },
      });
      return { status: res.status, headers: res.headers, body: res.body };
    };

  it("reads, splits and stores a page, and reports its language", async () => {
    const bot = await createBot(db, alice, SETTINGS);
    const outcome = await readPage(
      db,
      bot.id,
      "https://toko.example/",
      serve(html("<h1>Menu</h1><p>Nasi goreng Rp 25.000</p>")),
    );

    expect(outcome.language).toBe("id");
    expect(outcome.page).toMatchObject({ status: "ok", title: "Toko", chunkCount: 1 });
    expect((await loadChunks(db, bot.id))[0].text).toContain("Nasi goreng Rp 25.000");
  });

  it("explains a page that has no text without JavaScript", async () => {
    const bot = await createBot(db, alice, SETTINGS);
    const outcome = await readPage(
      db,
      bot.id,
      "https://toko.example/",
      serve('<html><body><div id="root"></div></body></html>'),
    );

    expect(outcome.page.status).toBe("failed");
    expect(outcome.page.error).toMatch(/JavaScript/);
  });
});

describe("usage", () => {
  it("counts messages per account and month", async () => {
    const carol = (await createAccount(db, "carol@example.com", "hash-c"))!.id;
    expect(await messagesUsed(db, carol, "2026-11")).toBe(0);
    expect(await countMessage(db, carol, "2026-11")).toBe(1);
    expect(await countMessage(db, carol, "2026-11")).toBe(2);
    expect(await countMessage(db, carol, "2026-12")).toBe(1);
    expect(await messagesUsed(db, carol, "2026-11")).toBe(2);
  });

  it("does not lose a count when messages arrive at the same time", async () => {
    const dave = (await createAccount(db, "dave@example.com", "hash-d"))!.id;
    await Promise.all(Array.from({ length: 20 }, () => countMessage(db, dave, "2026-11")));
    expect(await messagesUsed(db, dave, "2026-11")).toBe(20);
  });

  it("uses a UTC month key and falls back to the free limits for an unknown plan", () => {
    expect(monthKey(new Date("2026-11-30T23:59:59Z"))).toBe("2026-11");
    expect(limitsFor("mystery")).toEqual(limitsFor("free"));
  });
});

describe("inbox", () => {
  it("lists leads and unanswered questions, newest first", async () => {
    const bot = await createBot(db, alice, SETTINGS);
    await addLead(db, bot.id, { name: "Budi", contact: "budi@example.com", question: "Harga?" });
    await addUnanswered(db, bot.id, "Bisa pasang behel?", "not on the pages");

    expect(await listLeads(db, bot.id)).toMatchObject([
      { name: "Budi", contact: "budi@example.com" },
    ]);
    const [entry] = await listUnanswered(db, bot.id);
    expect(entry).toMatchObject({ question: "Bisa pasang behel?", reason: "not on the pages" });
    expect(new Date(entry.at).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("passwords", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("kata sandi panjang");
    expect(stored).not.toContain("kata sandi");
    expect(await verifyPassword("kata sandi panjang", stored)).toBe(true);
    expect(await verifyPassword("kata sandi pendek", stored)).toBe(false);
  });

  it("gives the same password a different hash each time", async () => {
    expect(await hashPassword("kata sandi panjang")).not.toBe(
      await hashPassword("kata sandi panjang"),
    );
  });

  it("rejects a stored value it does not understand", async () => {
    expect(await verifyPassword("apa saja", "plain-text")).toBe(false);
  });
});

describe("form values", () => {
  it("accepts an email or a phone number as a visitor's contact", () => {
    expect(contactField(" budi@example.com ")).toBe("budi@example.com");
    expect(contactField("+62 812-3456-789")).toBe("+62 812-3456-789");
    expect(contactField("hubungi saya")).toBeNull();
    expect(contactField("12345")).toBeNull();
  });

  it("lower-cases emails so one person cannot register twice", () => {
    expect(emailField("Alice@Example.COM")).toBe("alice@example.com");
    expect(emailField("alice@")).toBeNull();
  });

  it("only accepts contact links that cannot run script", () => {
    expect(contactLink("https://wa.me/628123456789")).toBe("https://wa.me/628123456789");
    expect(contactLink("mailto:halo@toko.example")).toBe("mailto:halo@toko.example");
    expect(contactLink("")).toBeNull();
    expect(contactLink("javascript:alert(1)")).toBeUndefined();
    expect(contactLink("data:text/html,<script>1</script>")).toBeUndefined();
    expect(contactLink("wa.me/628123456789")).toBeUndefined();
  });
});
