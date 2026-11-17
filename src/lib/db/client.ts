import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The one thing the rest of the app needs from a database. Both drivers below speak Postgres,
// so there is a single set of SQL statements (src/lib/store.ts) and the tests exercise the
// same queries that run in production.
export type Db = {
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Row[]>;
};

const schemaSql = () => readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");

// Production: a normal Postgres server (Supabase, Neon, ...).
async function connectPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  // Serverless instances each hold their own pool, so keep it small.
  // DATABASE_CA holds the provider's root certificate in PEM form, with a literal backslash-n
  // where the file has line breaks. With it the server's identity is verified; leave "sslmode"
  // out of DATABASE_URL in that case, because options in the connection string take precedence
  // over the ones given here.
  const ca = process.env.DATABASE_CA?.replaceAll("\\n", "\n");
  const pool = new Pool({ connectionString: url, max: 3, ...(ca ? { ssl: { ca } } : {}) });
  await pool.query(schemaSql());
  return {
    async query<Row>(sql: string, params: unknown[] = []) {
      return (await pool.query(sql, params)).rows as Row[];
    },
  };
}

// Development and tests: Postgres compiled to WebAssembly, running inside this process.
// `dataDir` undefined keeps everything in memory.
export async function connectEmbedded(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(dataDir);
  await pg.exec(schemaSql());
  return {
    async query<Row>(sql: string, params: unknown[] = []) {
      return (await pg.query(sql, params)).rows as Row[];
    },
  };
}

// Kept on globalThis so that hot reloads in `next dev` reuse the connection instead of opening
// the embedded database a second time.
const holder = globalThis as typeof globalThis & { __tanyaSitusDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  holder.__tanyaSitusDb ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (url) return connectPostgres(url);
    if (process.env.VERCEL) {
      // A serverless host has no disk to keep the embedded database on.
      throw new Error("DATABASE_URL is not set");
    }
    const dataDir = path.join(process.cwd(), ".data", "pg");
    mkdirSync(path.dirname(dataDir), { recursive: true });
    return connectEmbedded(dataDir);
  })();
  // A failed connection must not be remembered, or every later request would fail too.
  holder.__tanyaSitusDb.catch(() => {
    holder.__tanyaSitusDb = undefined;
  });
  return holder.__tanyaSitusDb;
}
