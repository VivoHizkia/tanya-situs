import type { Metadata } from "next";
import Link from "next/link";
import { NewBotForm } from "@/components/NewBotForm";
import { SiteHeader } from "@/components/SiteHeader";
import { requireAccount } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { limitsFor, monthKey } from "@/lib/limits";
import { listBots, messagesUsed } from "@/lib/store";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const account = await requireAccount();
  const db = await getDb();
  const [bots, used] = await Promise.all([
    listBots(db, account.id),
    messagesUsed(db, account.id, monthKey()),
  ]);
  const limits = limitsFor(account.plan);
  const contactUrl = process.env.CONTACT_URL;

  return (
    <>
      <SiteHeader email={account.email} />
      <main className="page">
        <h1>Your chatbots</h1>

        <p className="usage">
          <strong>{account.plan === "pro" ? "Pro" : "Free"} plan.</strong> {used} of{" "}
          {limits.messagesPerMonth} messages used this month, {bots.length} of {limits.bots} chatbot
          {limits.bots === 1 ? "" : "s"}.
          {account.plan === "free" && contactUrl && (
            <>
              {" "}
              <a href={contactUrl}>Upgrade</a>
            </>
          )}
        </p>

        {bots.length > 0 && (
          <ul className="bot-list">
            {bots.map((bot) => (
              <li key={bot.id}>
                <Link href={`/dashboard/${bot.id}`} className="card bot-list__item">
                  <strong>{bot.name}</strong>
                  <span>Pages, install code and inbox →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {bots.length < limits.bots ? (
          <NewBotForm />
        ) : (
          <p className="muted">Your plan includes {limits.bots} chatbot(s).</p>
        )}
      </main>
    </>
  );
}
