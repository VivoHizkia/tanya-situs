"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatStrings } from "@/lib/strings";
import type { ChatResponse, ChatTurn } from "@/lib/types";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  // Only on bot replies that came back from /api/chat.
  response?: ChatResponse;
};

type Props = {
  botId: string;
  name: string;
  welcome: string;
  strings: ChatStrings;
};

const MAX_QUESTION_CHARS = 500;
const WELCOME_ID = 0;

export function Chat({ botId, name, welcome, strings }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { id: WELCOME_ID, role: "assistant", content: welcome },
  ]);
  const [loading, setLoading] = useState(false);
  // Id of the message that currently has the lead form under it.
  const [leadFormFor, setLeadFormFor] = useState<number | null>(null);
  const [leadSent, setLeadSent] = useState(false);

  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);
  // The text box is read when the form is sent instead of being tracked in state, so a
  // question typed before the page finished loading is not lost.
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, loading, leadFormFor]);

  // Inside the widget's frame, key presses never reach the host page. Escape is passed up so
  // the widget can close itself. The message carries no data.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && window.parent !== window) {
        window.parent.postMessage("tanya-situs:close", "*");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addMessage = (message: Omit<Message, "id">): number => {
    const id = nextId.current++;
    setMessages((previous) => [...previous, { ...message, id }]);
    return id;
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;

    // The welcome line is ours, not part of the conversation the model needs to see.
    const history: ChatTurn[] = messages
      .filter((message) => message.id !== WELCOME_ID)
      .map(({ role, content }) => ({ role, content }));

    addMessage({ role: "user", content: question });
    if (inputRef.current) inputRef.current.value = "";
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId, question, history }),
      });
      const data = (await res.json()) as ChatResponse & { error?: string };
      // The API's own error text ("Too many messages...") is already written for visitors.
      if (!res.ok) throw new Error(data.error ?? strings.failed);

      const id = addMessage({ role: "assistant", content: data.answer, response: data });
      if (data.offerLeadForm && !leadSent) setLeadFormFor(id);
    } catch (err) {
      addMessage({
        role: "assistant",
        content: err instanceof Error && err.message ? err.message : strings.failed,
      });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(inputRef.current?.value ?? "");
  };

  const lastQuestion = messages.findLast((message) => message.role === "user")?.content ?? "";

  return (
    <section className="chat" aria-label={name}>
      <header className="chat__head">
        <strong>{name}</strong>
        <span>{strings.poweredBy}</span>
      </header>

      <div className="chat__messages" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`msg msg--${message.role}`}>
            <div className="bubble">
              {message.content}
              <Extras response={message.response} strings={strings} />
            </div>
            {leadFormFor === message.id && !leadSent && (
              <LeadForm
                botId={botId}
                question={lastQuestion}
                strings={strings}
                onSent={() => setLeadSent(true)}
                onDismiss={() => setLeadFormFor(null)}
              />
            )}
            {leadFormFor === message.id && leadSent && (
              <p className="lead-ok">{strings.leadDone}</p>
            )}
          </div>
        ))}
        {loading && (
          <div className="msg msg--assistant">
            <div className="bubble bubble--typing">{strings.thinking}</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat__composer" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          placeholder={strings.placeholder}
          maxLength={MAX_QUESTION_CHARS}
          aria-label={strings.placeholder}
        />
        <button type="submit" disabled={loading}>
          {strings.send}
        </button>
      </form>
    </section>
  );
}

// Source links and the contact link under a bot reply. Both come from the server, which
// builds them from stored data; the model never writes a URL.
function Extras({ response, strings }: { response?: ChatResponse; strings: ChatStrings }) {
  if (!response) return null;
  const { sources, contactUrl } = response;
  return (
    <>
      {sources.length > 0 && (
        <div className="sources">
          <span>{sources.length > 1 ? strings.sources : strings.source}:</span>
          {sources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          ))}
        </div>
      )}
      {contactUrl && (
        <a className="contact-link" href={contactUrl} target="_blank" rel="noreferrer">
          {strings.contact} →
        </a>
      )}
    </>
  );
}

type LeadProps = {
  botId: string;
  // The question that led here, sent along so the business has context.
  question: string;
  strings: ChatStrings;
  onSent: () => void;
  onDismiss: () => void;
};

function LeadForm({ botId, question, strings, onSent, onDismiss }: LeadProps) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId, name, contact, question }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? strings.failed);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.failed);
      setSending(false);
    }
  };

  return (
    <form className="lead" onSubmit={onSubmit}>
      <p>{strings.leadIntro}</p>
      <input
        required
        placeholder={strings.leadName}
        aria-label={strings.leadName}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={100}
      />
      <input
        required
        placeholder={strings.leadContact}
        aria-label={strings.leadContact}
        value={contact}
        onChange={(event) => setContact(event.target.value)}
        maxLength={200}
      />
      <div className="lead__buttons">
        <button type="submit" disabled={sending}>
          {sending ? strings.leadSending : strings.leadSend}
        </button>
        <button type="button" className="ghost" onClick={onDismiss}>
          {strings.leadSkip}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
