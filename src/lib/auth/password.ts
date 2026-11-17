import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Passwords are hashed with scrypt from Node's standard library: deliberately slow and
// memory-hard, with a random salt per password. Stored as "scrypt$<salt>$<hash>".

const KEY_LENGTH = 64;

export const MIN_PASSWORD_LENGTH = 10;
// scrypt reads the whole password, so an upper bound stops someone posting megabytes.
export const MAX_PASSWORD_LENGTH = 200;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Verified when the email is unknown, so "no such account" takes as long as "wrong password"
// and the response time does not reveal which emails are registered.
export const DUMMY_HASH =
  "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
