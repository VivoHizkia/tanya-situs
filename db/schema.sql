-- Every statement is safe to run again, so the app applies this file each time it starts.

CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the SHA-256 of a session token is stored, so a leaked table cannot be used to log in.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- The bot id is public: it appears in the embed snippet on the customer's site.
CREATE TABLE IF NOT EXISTS bots (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  language      TEXT NOT NULL DEFAULT 'en',
  welcome       TEXT NOT NULL,
  contact_url   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bots_account ON bots (account_id);

CREATE TABLE IF NOT EXISTS pages (
  id          TEXT PRIMARY KEY,
  bot_id      TEXT NOT NULL REFERENCES bots (id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL,
  error       TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bot_id, url)
);

CREATE TABLE IF NOT EXISTS chunks (
  id       TEXT PRIMARY KEY,
  page_id  TEXT NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
  bot_id   TEXT NOT NULL REFERENCES bots (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  section  TEXT NOT NULL,
  body     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_bot ON chunks (bot_id);

CREATE TABLE IF NOT EXISTS leads (
  id         TEXT PRIMARY KEY,
  bot_id     TEXT NOT NULL REFERENCES bots (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  contact    TEXT NOT NULL,
  question   TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_bot ON leads (bot_id, created_at DESC);

-- Questions the bot could not answer: the owner's list of what to add to the site.
CREATE TABLE IF NOT EXISTS unanswered (
  id         TEXT PRIMARY KEY,
  bot_id     TEXT NOT NULL REFERENCES bots (id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unanswered_bot ON unanswered (bot_id, created_at DESC);

-- Messages answered per account per calendar month ("2026-11"), for the plan quota.
CREATE TABLE IF NOT EXISTS usage (
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  month      TEXT NOT NULL,
  messages   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, month)
);
