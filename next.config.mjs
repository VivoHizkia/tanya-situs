/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // These load native or WASM files at runtime and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "undici"],
  // db/schema.sql is read from disk at start-up, so it has to be shipped with the server code.
  outputFileTracingIncludes: { "/**": ["./db/schema.sql"] },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];
    return [
      // The chat page is the only one that other sites may put in a frame.
      { source: "/embed/:path*", headers: common },
      {
        source: "/((?!embed/).*)",
        headers: [...common, { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
    ];
  },
};

export default nextConfig;
