import { lookup as dnsLookup } from "node:dns";
import type { LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { isAllowed, parseRobots } from "./robots";
import { isPublicAddress, parsePublicUrl, UnsafeUrlError } from "./safe-url";

// Reads one page of a customer's site: it identifies itself, obeys robots.txt, follows a few
// redirects and refuses large or non-text responses.

export const CRAWLER_NAME = "TanyaSitusBot";
export const USER_AGENT = `${CRAWLER_NAME}/1.0 (reads pages a site owner added to their chatbot; obeys robots.txt)`;

const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;
const MAX_BYTES = 2 * 1024 * 1024;

export class FetchError extends Error {}

export type FetchedPage =
  | { status: "ok"; html: string; finalUrl: string }
  | { status: "blocked" }
  | { status: "failed"; error: string };

// A minimal response, so tests can supply pages without a network.
export type HttpResponse = {
  status: number;
  headers: { get(name: string): string | null };
  body: HttpBody | null;
};
// The part of a web ReadableStream that is used here.
type HttpBody = {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    cancel(): Promise<void>;
  };
  cancel(): Promise<void>;
};
export type HttpGet = (url: string) => Promise<HttpResponse>;

// DNS lookup that refuses private addresses.
//
// Checking the hostname before connecting is not enough: a hostile DNS server can answer with
// a public address for the check and a private one for the connection. Giving this function
// to the HTTP client as its resolver means the address that was checked is the address that
// gets connected to.
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const blocked = addresses.find((entry) => !isPublicAddress(entry.address));
    if (blocked || addresses.length === 0) {
      return callback(new UnsafeUrlError("That address is not on the public web."), "", 0);
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

let agent: Agent | null = null;

const httpGet: HttpGet = (url) => {
  agent ??= new Agent({ connect: { lookup: publicOnlyLookup, timeout: TIMEOUT_MS } });
  return undiciFetch(url, {
    dispatcher: agent,
    // Redirects are followed by hand so every hop goes through parsePublicUrl.
    redirect: "manual",
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain;q=0.9" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
};

// Reads the body but stops as soon as it passes the size limit, so a huge file is never held
// in memory.
async function readLimited(res: HttpResponse): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError("The page is larger than 2 MB.");
    }
    parts.push(value);
  }
  return Buffer.concat(parts).toString("utf8");
}

async function getFollowingRedirects(
  get: HttpGet,
  startUrl: string,
): Promise<{ res: HttpResponse; url: string }> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await get(url);
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return { res, url };

    await res.body?.cancel();
    url = parsePublicUrl(new URL(location, url).toString()).toString();
  }
  throw new FetchError("The page redirects too many times.");
}

// What went wrong, in words a site owner can act on. Internal details stay out.
function describe(err: unknown): string {
  if (err instanceof FetchError || err instanceof UnsafeUrlError) return err.message;
  const text = err instanceof Error ? `${err.name} ${err.message} ${String(err.cause ?? "")}` : "";
  if (/public web/.test(text)) return "That address is not on the public web.";
  if (/Timeout|aborted/i.test(text)) return "The site took too long to answer.";
  if (/ENOTFOUND|EAI_AGAIN/.test(text)) return "The site could not be found.";
  return "The site could not be reached.";
}

export async function fetchPage(rawUrl: string, get: HttpGet = httpGet): Promise<FetchedPage> {
  try {
    const url = parsePublicUrl(rawUrl);

    // A missing or unreachable robots.txt means nothing is disallowed.
    const robots = await getFollowingRedirects(get, `${url.origin}/robots.txt`)
      .then(async ({ res }) => (res.status === 200 ? await readLimited(res) : ""))
      .catch(() => "");
    if (!isAllowed(parseRobots(robots, CRAWLER_NAME), url.toString())) return { status: "blocked" };

    const { res, url: finalUrl } = await getFollowingRedirects(get, url.toString());
    if (res.status !== 200) {
      await res.body?.cancel();
      return { status: "failed", error: `The site answered with error ${res.status}.` };
    }
    const type = res.headers.get("content-type") ?? "";
    if (type && !/text\/html|text\/plain|xhtml/i.test(type)) {
      await res.body?.cancel();
      return { status: "failed", error: "That address is not a web page." };
    }
    return { status: "ok", html: await readLimited(res), finalUrl };
  } catch (err) {
    return { status: "failed", error: describe(err) };
  }
}
