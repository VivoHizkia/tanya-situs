import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { allowRequest, clientKey } from "@/lib/rate-limit";
import { addLead, findPublicBot } from "@/lib/store";
import { contactField, textField } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEADS_PER_MINUTE = 3;

export async function POST(req: Request) {
  if (!allowRequest(`lead:${clientKey(req)}`, LEADS_PER_MINUTE)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const botId = textField(body?.botId, 40);
  const name = textField(body?.name, 100);
  const contact = contactField(body?.contact);
  const question = textField(body?.question, 500);

  if (!name || !contact) {
    return NextResponse.json(
      { error: "Please enter your name and a valid email or phone number." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const found = await findPublicBot(db, botId);
  if (!found) return NextResponse.json({ error: "Unknown chatbot." }, { status: 404 });

  await addLead(db, found.bot.id, { name, contact, question });
  return NextResponse.json({ ok: true });
}
