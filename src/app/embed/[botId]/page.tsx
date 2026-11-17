import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chat } from "@/components/Chat";
import { getDb } from "@/lib/db/client";
import { findPublicBot } from "@/lib/store";
import { chatStrings } from "@/lib/strings";

export const dynamic = "force-dynamic";

// This page is loaded inside a frame on customers' sites; it should not appear in search results.
export const metadata: Metadata = { title: "Chat", robots: { index: false, follow: false } };

export default async function EmbedPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const found = await findPublicBot(await getDb(), botId);
  if (!found) notFound();
  const { bot } = found;

  return (
    <main className="embed">
      <Chat
        botId={bot.id}
        name={bot.name}
        welcome={bot.welcome}
        strings={chatStrings(bot.language)}
      />
    </main>
  );
}
