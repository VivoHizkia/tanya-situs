"use client";

import { useState, useTransition, type FormEvent } from "react";
import { deletePageAction, readPageAction, suggestPagesAction } from "@/app/actions";
import type { Page } from "@/lib/types";

type Props = { botId: string; initialPages: Page[]; pageLimit: number };

const STATUS_LABEL: Record<Page["status"], string> = {
  ok: "Read",
  blocked: "Not allowed",
  failed: "Could not be read",
};

export function PagesManager({ botId, initialPages, pageLimit }: Props) {
  const [pages, setPages] = useState(initialPages);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  // The address being read right now, shown as progress.
  const [reading, setReading] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [searching, startSearch] = useTransition();

  const busy = reading !== null;
  const room = pageLimit - pages.length;

  const upsert = (page: Page) =>
    setPages((previous) =>
      [...previous.filter((existing) => existing.id !== page.id), page].sort((a, b) =>
        a.url.localeCompare(b.url),
      ),
    );

  // Pages are read one at a time: each request stays short, the owner sees progress, and the
  // customer's site gets one request at a time from us.
  const readAll = async (urls: string[]) => {
    setError("");
    for (const url of urls) {
      setReading(url);
      const result = await readPageAction(botId, url);
      if (result.page) upsert(result.page);
      if (result.error) {
        setError(result.error);
        break;
      }
    }
    setReading(null);
  };

  const onAdd = async (event: FormEvent) => {
    event.preventDefault();
    const urls = input
      .split(/[\s,]+/)
      .map((url) => url.trim())
      .filter(Boolean);
    if (urls.length === 0) return;
    setInput("");
    await readAll(urls);
  };

  const onSuggest = () =>
    startSearch(async () => {
      setError("");
      const result = await suggestPagesAction(botId);
      if (result.error) setError(result.error);
      setSuggestions(result.urls);
      setChosen(new Set(result.urls.slice(0, Math.max(room, 0))));
    });

  const onAddChosen = async () => {
    const urls = [...chosen];
    setSuggestions(null);
    setChosen(new Set());
    await readAll(urls);
  };

  const onDelete = async (page: Page) => {
    setPages((previous) => previous.filter((existing) => existing.id !== page.id));
    await deletePageAction(botId, page.id);
  };

  const toggle = (url: string) =>
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  return (
    <div className="stack">
      <p className="muted">
        The chatbot answers only from these pages. {pages.length} of {pageLimit} used.
      </p>

      {pages.length > 0 && (
        <ul className="page-list">
          {pages.map((page) => (
            <li key={page.id} data-status={page.status}>
              <div className="page-list__main">
                <strong>{page.title || page.url}</strong>
                <a href={page.url} target="_blank" rel="noreferrer">
                  {page.url}
                </a>
                <span className="page-list__status">
                  {STATUS_LABEL[page.status]}
                  {page.status === "ok" && `, ${page.chunkCount} passages`}
                  {page.error && `: ${page.error}`}
                </span>
              </div>
              <div className="page-list__actions">
                <button
                  type="button"
                  className="button button--quiet"
                  disabled={busy}
                  onClick={() => void readAll([page.url])}
                >
                  Read again
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  disabled={busy}
                  onClick={() => void onDelete(page)}
                  aria-label={`Remove ${page.title || page.url}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {reading && (
        <p className="progress" role="status">
          Reading {reading}…
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={onAdd} className="inline-form">
        <label>
          Add pages
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={2}
            placeholder={"example.com/prices\nexample.com/contact"}
            disabled={busy}
          />
          <small>One address per line. Prices, services, contact and FAQ pages matter most.</small>
        </label>
        <div className="button-row">
          <button type="submit" className="button" disabled={busy || !input.trim()}>
            Read pages
          </button>
          <button
            type="button"
            className="button button--quiet"
            disabled={busy || searching || pages.length === 0}
            onClick={onSuggest}
          >
            {searching ? "Looking…" : "Find pages on my site"}
          </button>
        </div>
      </form>

      {suggestions && suggestions.length === 0 && !error && (
        <p className="muted">No other pages were found from your home page.</p>
      )}
      {suggestions && suggestions.length > 0 && (
        <fieldset className="suggestions">
          <legend>Pages found on your site</legend>
          {suggestions.map((url) => (
            <label key={url} className="check">
              <input type="checkbox" checked={chosen.has(url)} onChange={() => toggle(url)} />
              <span>{url}</span>
            </label>
          ))}
          <button
            type="button"
            className="button"
            disabled={busy || chosen.size === 0}
            onClick={() => void onAddChosen()}
          >
            Read {chosen.size} selected
          </button>
        </fieldset>
      )}
    </div>
  );
}
