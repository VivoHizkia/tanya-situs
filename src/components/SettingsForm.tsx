"use client";

import { useActionState } from "react";
import { deleteBotAction, updateBotAction, type FormState } from "@/app/actions";
import { SUPPORTED_LANGUAGES } from "@/lib/strings";
import type { Bot } from "@/lib/types";

const INITIAL: FormState = {};

export function SettingsForm({ bot }: { bot: Bot }) {
  const [state, action, pending] = useActionState(updateBotAction, INITIAL);

  return (
    <div className="stack">
      <form action={action} className="stack">
        <input type="hidden" name="botId" value={bot.id} />
        <label>
          Business name
          <input name="name" required maxLength={80} defaultValue={bot.name} />
        </label>
        <label>
          Welcome message
          <input name="welcome" required maxLength={300} defaultValue={bot.welcome} />
        </label>
        <label>
          Language of your pages
          <select name="language" defaultValue={bot.language}>
            {SUPPORTED_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
          <small>Visitors can still ask in any language and are answered in theirs.</small>
        </label>
        <label>
          Contact link
          <input
            name="contactUrl"
            maxLength={500}
            defaultValue={bot.contactUrl ?? ""}
            placeholder="https://wa.me/628123456789"
          />
          <small>Shown when the chatbot cannot answer or the visitor wants to order or book.</small>
        </label>

        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="form-ok" role="status">
            Saved.
          </p>
        )}

        <div className="button-row">
          <button type="submit" className="button" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>

      <form
        action={deleteBotAction}
        className="danger"
        onSubmit={(event) => {
          const sure = window.confirm(
            `Delete "${bot.name}"? Its pages, leads and unanswered questions are deleted too. This cannot be undone.`,
          );
          if (!sure) event.preventDefault();
        }}
      >
        <input type="hidden" name="botId" value={bot.id} />
        <button type="submit" className="button button--danger">
          Delete this chatbot
        </button>
      </form>
    </div>
  );
}
