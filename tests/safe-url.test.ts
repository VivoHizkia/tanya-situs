import { describe, expect, it } from "vitest";
import { isPublicAddress, parsePublicUrl, UnsafeUrlError } from "@/lib/crawl/safe-url";

describe("parsePublicUrl", () => {
  it("adds https to an address typed without a scheme", () => {
    expect(parsePublicUrl("example.com/harga").toString()).toBe("https://example.com/harga");
  });

  it("drops the fragment, which never reaches the server", () => {
    expect(parsePublicUrl("https://example.com/a#section").toString()).toBe(
      "https://example.com/a",
    );
  });

  it.each([
    ["an empty value", "   "],
    ["a file address", "file:///etc/passwd"],
    ["another scheme", "ftp://example.com/"],
    ["credentials in the address", "https://user:pass@example.com/"],
    ["a non-web port", "http://example.com:5432/"],
    ["localhost", "http://localhost/"],
    ["a single-label host", "http://intranet/"],
    ["an internal name", "http://db.internal/"],
    ["a loopback address", "http://127.0.0.1/"],
    ["the cloud metadata address", "http://169.254.169.254/latest/meta-data/"],
    ["a private address", "http://192.168.1.10/"],
    ["IPv6 loopback", "http://[::1]/"],
    ["a decimal IP that means 127.0.0.1", "http://2130706433/"],
  ])("refuses %s", (_label, input) => {
    expect(() => parsePublicUrl(input)).toThrow(UnsafeUrlError);
  });
});

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "203.0.114.5", "2606:4700:4700::1111"])("accepts %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "224.0.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "64:ff9b::7f00:1",
    "not-an-address",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});
