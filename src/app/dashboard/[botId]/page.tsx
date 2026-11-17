import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstallSnippet } from "@/components/InstallSnippet";
import { PagesManager } from "@/components/PagesManager";
import { SettingsForm } from "@/components/SettingsForm";
import { SiteHeader } from "@/components/SiteHeader";
import { requireAccount } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { limitsFor } from "@/lib/limits";
import { findOwnedBot, listLeads, listPages, listUnanswered } from "@/lib/store";

export const metadata: Metadata = { title: "Chatbot" };
export const dynamic = "force-dynamic";

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));

// The address visitors' browsers will load the widget from: wherever this app is being served.
async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const protocol =
    list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export default async function BotPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const account = await requireAccount();
  const db = await getDb();

  // Someone else's bot id gives the same "not found" as an id that does not exist.
  const bot = await findOwnedBot(db, account.id, botId);
  if (!bot) notFound();

  const [pages, leads, unanswered] = await Promise.all([
    listPages(db, bot.id),
    listLeads(db, bot.id),
    listUnanswered(db, bot.id),
  ]);
  const snippet = `<script src="${await appOrigin()}/widget.js" data-bot="${bot.id}" async></script>`;

  return (
    <>
      <SiteHeader email={account.email} />
      <main className="page">
        <p className="crumb">
          <Link href="/dashboard">← All chatbots</Link>
        </p>
        <h1>{bot.name}</h1>

        <div className="bot-layout">
          <div className="bot-layout__main">
            <section className="card" aria-labelledby="pages-title">
              <h2 id="pages-title">1. Pages</h2>
              <PagesManager
                botId={bot.id}
                initialPages={pages}
                pageLimit={limitsFor(account.plan).pagesPerBot}
              />
            </section>

            <section className="card" aria-labelledby="install-title">
              <h2 id="install-title">2. Add it to your site</h2>
              <InstallSnippet snippet={snippet} />
            </section>

            <section className="card" aria-labelledby="leads-title">
              <h2 id="leads-title">Leads</h2>
              {leads.length === 0 ? (
                <p className="muted">
                  When the chatbot cannot answer, or a visitor wants to order or book, it asks for
                  their contact details. They appear here.
                </p>
              ) : (
                <ul className="inbox">
                  {leads.map((lead) => (
                    <li key={lead.id}>
                      <strong>{lead.name}</strong> <span>{lead.contact}</span>
                      {lead.question && <p>“{lead.question}”</p>}
                      <time dateTime={lead.at}>{formatDate(lead.at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="gaps-title">
              <h2 id="gaps-title">Questions it could not answer</h2>
              {unanswered.length === 0 ? (
                <p className="muted">
                  Questions your pages do not cover are listed here, so you know what to add to your
                  site.
                </p>
              ) : (
                <ul className="inbox">
                  {unanswered.map((entry) => (
                    <li key={entry.id}>
                      <p>“{entry.question}”</p>
                      <span>{entry.reason}</span>{" "}
                      <time dateTime={entry.at}>{formatDate(entry.at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="settings-title">
              <h2 id="settings-title">Settings</h2>
              <SettingsForm bot={bot} />
            </section>
          </div>

          <aside className="bot-layout__side" aria-labelledby="try-title">
            <h2 id="try-title">Try it</h2>
            <iframe
              className="preview"
              title={`Preview of the ${bot.name} chatbot`}
              src={`/embed/${bot.id}`}
            />
            <p className="muted">
              This is what visitors see. Test messages count toward your monthly allowance.
            </p>
          </aside>
        </div>
      </main>
    </>
  );
}
