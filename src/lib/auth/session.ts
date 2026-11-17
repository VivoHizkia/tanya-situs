import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { createSession, deleteSession, findSessionAccount } from "@/lib/store";
import type { Account } from "@/lib/types";

const COOKIE = "ts_session";
const SESSION_DAYS = 30;

// The browser holds the random token; the database holds only its hash.
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export async function startSession(accountId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await createSession(await getDb(), hashToken(token), accountId, expires);

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    // Lax: the cookie is not sent on cross-site POSTs, which is what stops CSRF here.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await deleteSession(await getDb(), hashToken(token));
  jar.delete(COOKIE);
}

export async function currentAccount(): Promise<Account | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return findSessionAccount(await getDb(), hashToken(token));
}

// For pages and actions that only a signed-in owner may use.
export async function requireAccount(): Promise<Account> {
  const account = await currentAccount();
  if (!account) redirect("/login");
  return account;
}
