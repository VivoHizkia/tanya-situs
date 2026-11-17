import type { LlmCall } from "@/lib/llm";
import type { Chunk } from "@/lib/types";

export function chunk(
  id: string,
  section: string,
  text: string,
  url = "https://toko.example/harga",
): Chunk {
  return { id, url, pageTitle: "Klinik Gigi Sehat", section, text };
}

// A fake LLM that returns the given replies in order: first the planner's, then the answer's.
// It records what it was sent, so tests can check the prompts.
export function scriptedLlm(...replies: (object | string | Error)[]) {
  const calls: string[][] = [];
  const llm: LlmCall = async (messages) => {
    calls.push(messages.map((message) => message.content));
    const reply = replies[calls.length - 1];
    if (reply === undefined) throw new Error("the fake LLM ran out of replies");
    if (reply instanceof Error) throw reply;
    return typeof reply === "string" ? reply : JSON.stringify(reply);
  };
  return { llm, calls };
}
