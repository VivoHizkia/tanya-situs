import { describe, expect, it } from "vitest";
import { chunkSections, MAX_CHUNKS_PER_PAGE } from "@/lib/crawl/chunk";
import { extractPage, findSiteLinks } from "@/lib/crawl/extract";

const PAGE = `<!doctype html>
<html lang="id-ID">
<head>
  <title>Klinik Gigi Sehat | Harga</title>
  <meta name="description" content="Klinik gigi keluarga di Bandung.">
  <script>window.secret = "jangan terbaca";</script>
</head>
<body>
  <nav><a href="/">Beranda</a><a href="/harga">Harga</a></nav>
  <main>
    <h1>Daftar Harga</h1>
    <p>Harga berlaku mulai <strong>Januari 2026</strong>.</p>
    <h2>Perawatan</h2>
    <table>
      <tr><th>Layanan</th><th>Harga</th></tr>
      <tr><td>Scaling</td><td>Rp 350.000</td></tr>
      <tr><td>Tambal gigi</td><td>Rp 250.000</td></tr>
    </table>
    <h2>Jam Buka</h2>
    <ul><li>Senin sampai Sabtu, 09.00 sampai 20.00</li></ul>
    <form><input name="email"><button>Daftar</button></form>
  </main>
  <footer>Hak cipta 2026</footer>
</body>
</html>`;

describe("extractPage", () => {
  const page = extractPage(PAGE);

  it("reads the title and the language", () => {
    expect(page.title).toBe("Klinik Gigi Sehat | Harga");
    expect(page.language).toBe("id");
  });

  it("starts a section at each heading", () => {
    expect(page.sections.map((section) => section.heading)).toEqual([
      "Klinik Gigi Sehat | Harga",
      "Daftar Harga",
      "Perawatan",
      "Jam Buka",
    ]);
  });

  it("keeps the meta description as the first line", () => {
    expect(page.sections[0].lines).toEqual(["Klinik gigi keluarga di Bandung."]);
  });

  it("keeps inline text on one line", () => {
    expect(page.sections[1].lines).toEqual(["Harga berlaku mulai Januari 2026."]);
  });

  it("keeps a table row on one line, so a price stays with its item", () => {
    expect(page.sections[2].lines).toContain("Scaling | Rp 350.000");
  });

  it("drops menus, footers, forms and scripts", () => {
    const text = JSON.stringify(page.sections);
    expect(text).not.toMatch(/Beranda|Hak cipta|Daftar"|jangan terbaca/);
  });

  it("returns no sections for a page whose content is built by JavaScript", () => {
    const empty = extractPage(
      '<html><body><div id="root"></div><script>app()</script></body></html>',
    );
    expect(chunkSections(empty.sections)).toEqual([]);
  });
});

describe("chunkSections", () => {
  it("folds a short section into the one before it", () => {
    const chunks = chunkSections(extractPage(PAGE).sections);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("Perawatan:");
    expect(chunks[0].text).toContain("Scaling | Rp 350.000");
  });

  it("splits a long section and labels the continuation", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Baris nomor ${i} ${"kata ".repeat(20)}`);
    const chunks = chunkSections([{ heading: "Panjang", lines }]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].section).toBe("Panjang (cont.)");
    expect(chunks.every((chunk) => chunk.text.length <= 1400)).toBe(true);
  });

  it("caps the number of chunks a single page can produce", () => {
    const sections = Array.from({ length: 200 }, (_, i) => ({
      heading: `Bagian ${i}`,
      lines: ["x".repeat(400)],
    }));
    expect(chunkSections(sections)).toHaveLength(MAX_CHUNKS_PER_PAGE);
  });
});

describe("findSiteLinks", () => {
  const html = `<a href="/harga">Harga</a> <a href="kontak#form">Kontak</a>
    <a href="https://toko.example/blog/artikel-panjang">Blog</a>
    <a href="https://lain.example/">Lain</a> <a href="/brosur.pdf">Brosur</a>
    <a href="mailto:a@b.co">Email</a> <a href="/">Beranda</a> <a href="/harga?ref=1">Harga lagi</a>`;

  it("keeps same-site pages only, shortest first, without duplicates", () => {
    expect(findSiteLinks(html, "https://toko.example/")).toEqual([
      "https://toko.example/harga",
      "https://toko.example/kontak",
      "https://toko.example/blog/artikel-panjang",
    ]);
  });
});
