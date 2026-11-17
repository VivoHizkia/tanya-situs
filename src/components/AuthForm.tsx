"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type FormState } from "@/app/actions";

const INITIAL: FormState = {};

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const [state, action, pending] = useActionState(signup ? signupAction : loginAction, INITIAL);

  return (
    <form action={action} className="card auth">
      <h1>{signup ? "Create your account" : "Log in"}</h1>

      <label>
        Email
        <input name="email" type="email" required autoComplete="email" maxLength={200} />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          required
          minLength={signup ? 10 : undefined}
          maxLength={200}
          autoComplete={signup ? "new-password" : "current-password"}
        />
        {signup && <small>At least 10 characters.</small>}
      </label>

      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "One moment…" : signup ? "Create account" : "Log in"}
      </button>

      <p className="auth__switch">
        {signup ? (
          <>
            Already have an account? <Link href="/login">Log in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/signup">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}
