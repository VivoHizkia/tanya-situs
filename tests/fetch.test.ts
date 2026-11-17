import { describe, expect, it } from "vitest";
import { fetchPage, type HttpGet, type HttpResponse } from "@/lib/crawl/fetch";

function respond(
  status: number,
  body = "",
  headers: Record<string, string> = { "content-type": "text/html" },
): HttpResponse {
  const res = new Response(status === 204 || status === 304 ? null : body, { status, headers });
  return { status: res.status, headers: res.headers, body: res.body };
}

// A fake site: a map from address to response. Anything else is a 404.
function site(pages: Record<string, HttpResponse>): { get: HttpGet; requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    get: async (url) => {
      requested.push(url);
      return pages[url] ?? respond(404);
    },
  };
}

describe("fetchPage", () => {
  it("returns the HTML of a normal page", async () => {
    const { get } = site({ "https://toko.example/": respond(200, "<h1>Halo</h1>") });
    expect(await fetchPage("toko.example", get)).toEqual({
      status: "ok",
      html: "<h1>Halo</h1>",
      finalUrl: "https://toko.example/",
    });
  });

  it("does not request a page that robots.txt disallows", async () => {
    const { get, requested } = site({
      "https://toko.example/robots.txt": respond(200, "User-agent: *\nDisallow: /admin"),
      "https://toko.example/admin": respond(200, "secret"),
    });
    expect(await fetchPage("https://toko.example/admin", get)).toEqual({ status: "blocked" });
    expect(requested).toEqual(["https://toko.example/robots.txt"]);
  });

  it("follows a redirect to another public address", async () => {
    const { get } = site({
      "https://toko.example/": respond(301, "", { location: "https://www.toko.example/" }),
      "https://www.toko.example/": respond(200, "<p>ok</p>"),
    });
    const result = await fetchPage("https://toko.example/", get);
    expect(result).toMatchObject({ status: "ok", finalUrl: "https://www.toko.example/" });
  });

  it("refuses a redirect that points into a private network", async () => {
    const { get, requested } = site({
      "https://toko.example/": respond(302, "", { location: "http://169.254.169.254/latest" }),
    });
    const result = await fetchPage("https://toko.example/", get);
    expect(result).toEqual({ status: "failed", error: "That address is not on the public web." });
    expect(requested).not.toContain("http://169.254.169.254/latest");
  });

  it("gives up on a redirect loop", async () => {
    const { get } = site({
      "https://toko.example/a": respond(302, "", { location: "/a" }),
    });
    const result = await fetchPage("https://toko.example/a", get);
    expect(result).toEqual({ status: "failed", error: "The page redirects too many times." });
  });

  it("refuses a file that is not a web page", async () => {
    const { get } = site({
      "https://toko.example/menu.pdf": respond(200, "%PDF", { "content-type": "application/pdf" }),
    });
    const result = await fetchPage("https://toko.example/menu.pdf", get);
    expect(result).toEqual({ status: "failed", error: "That address is not a web page." });
  });

  it("stops reading a page larger than 2 MB", async () => {
    const { get } = site({
      "https://toko.example/": respond(200, "x".repeat(2 * 1024 * 1024 + 1)),
    });
    const result = await fetchPage("https://toko.example/", get);
    expect(result).toEqual({ status: "failed", error: "The page is larger than 2 MB." });
  });

  it("reports the status of a page that does not exist", async () => {
    const { get } = site({});
    const result = await fetchPage("https://toko.example/hilang", get);
    expect(result).toEqual({ status: "failed", error: "The site answered with error 404." });
  });

  it("never requests a private address, even when asked directly", async () => {
    const { get, requested } = site({});
    const result = await fetchPage("http://10.0.0.5/", get);
    expect(result.status).toBe("failed");
    expect(requested).toEqual([]);
  });

  it("describes a network failure without leaking internals", async () => {
    const get: HttpGet = async () => {
      throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND x") });
    };
    const result = await fetchPage("https://tidak-ada.example/", get);
    expect(result).toEqual({ status: "failed", error: "The site could not be found." });
  });
});
