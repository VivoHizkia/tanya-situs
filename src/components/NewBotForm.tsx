"use client";

import { useActionState } from "react";
import { createBotAction, type FormState } from "@/app/actions";

const INITIAL: FormState = {};

export function NewBotForm() {
  const [state, action, pending] = useActionState(createBotAction, INITIAL);

  return (
    <form action={action} className="card stack">
      <h2>Create a chatbot</h2>
      <label>
        Business name
        <input name="name" required maxLength={80} placeholder="Klinik Gigi Sehat" />
      </label>
      <label>
        Website address
        <input
          name="site"
          required
          maxLength={2000}
          placeholder="klinikgigisehat.com"
          inputMode="url"
        />
        <small>Your home page is read first. You can add more pages in the next step.</small>
      </label>

      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Reading your home page…" : "Create chatbot"}
      </button>
    </form>
  );
}
