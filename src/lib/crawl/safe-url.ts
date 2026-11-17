import { isIP } from "node:net";

// The crawler fetches addresses typed by customers, from inside our own network. Without the
// checks in this file a customer could point it at http://localhost, a cloud metadata service
// or a private database dashboard and read the answer through their bot.

export class UnsafeUrlError extends Error {}

const MAX_URL_LENGTH = 2000;

// Parses and normalises an address a customer typed. Throws UnsafeUrlError with a message
// that can be shown to them.
export function parsePublicUrl(input: string): URL {
  const text = input.trim();
  if (!text) throw new UnsafeUrlError("Enter a page address.");
  if (text.length > MAX_URL_LENGTH) throw new UnsafeUrlError("That address is too long.");

  let url: URL;
  try {
    // "example.com/harga" is what most people type.
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new UnsafeUrlError("That does not look like a web address.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https addresses can be read.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("Addresses with a username or password cannot be read.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UnsafeUrlError("Only the standard web ports can be read.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new UnsafeUrlError("That address is not on the public web.");
  } else if (!host.includes(".") || /\.(local|localhost|internal|lan|home|test)$/i.test(host)) {
    throw new UnsafeUrlError("That address is not on the public web.");
  }

  url.hash = "";
  return url;
}

function ipv4Parts(address: string): number[] | null {
  const parts = address.split(".").map(Number);
  const valid = parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
  return valid ? parts : null;
}

function isPublicIpv4(address: string): boolean {
  const parts = ipv4Parts(address);
  if (!parts) return false;
  const [a, b] = parts;

  if (a === 0 || a === 10 || a === 127) return false; // "this network", private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, includes cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0) return false; // protocol assignments and documentation
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast and reserved
  return true;
}

// True only for addresses that are reachable on the public internet.
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return isPublicIpv4(address);
  if (isIP(address) !== 6) return false;

  const lower = address.toLowerCase();
  // IPv4 written inside IPv6 ("::ffff:127.0.0.1") is judged by its IPv4 part.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]);
  // The same thing in hex ("::ffff:7f00:1") is refused outright: no real site needs it.
  if (lower.startsWith("::ffff:")) return false;

  if (lower === "::" || lower === "::1") return false; // unspecified, loopback
  if (/^f[cd]/.test(lower)) return false; // unique local fc00::/7
  if (/^fe[89ab]/.test(lower)) return false; // link-local fe80::/10
  if (lower.startsWith("ff")) return false; // multicast
  if (lower.startsWith("64:ff9b:")) return false; // NAT64, reaches IPv4 hosts
  if (lower.startsWith("2001:db8:")) return false; // documentation
  return true;
}
