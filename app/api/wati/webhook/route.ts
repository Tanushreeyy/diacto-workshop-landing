import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/booking/env";
import { setOptOut } from "@/lib/booking/service";
import { classifyInbound, OPT_OUT } from "@/lib/booking/config";
import { phoneKey } from "@/lib/booking/phone";
import { notifySlack } from "@/lib/booking/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inbound WhatsApp from WATI. Fires on every "message received"; we act on a
// human reply by stopping their follow-ups (and fully unsubscribing on a STOP
// word), then telling the team on Slack that it happened.
//
// Two guards, both load-bearing:
//   1. secret — WATI signs NOTHING (its own docs say "validate requests" but ship
//      no signature). So the secret rides in the URL (?secret=), like the cron
//      tick. Without it the endpoint is an open "silence any number" hole.
//   2. owner === false — WATI sends the SAME eventType:"message" for messages we
//      SENT (owner:true) as for messages received (owner:false). Miss this and
//      every WA nudge we send webhooks back and opts its own recipient out.
//
// Inert-by-design: if the WATI plan has no webhooks this route is simply never
// called. Nothing else depends on it.

interface WatiInbound {
  eventType?: string;
  owner?: boolean; // true = WE sent it. Only false (inbound) may opt anyone out.
  waId?: string; // sender's WhatsApp number, digits
  text?: string;
  type?: string; // text | image | ...
  senderName?: string;
}

export async function POST(req: NextRequest) {
  // 1) secret
  const want = env.watiWebhookSecret();
  const got = new URL(req.url).searchParams.get("secret") || req.headers.get("x-webhook-secret");
  if (!want || got !== want) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: WatiInbound;
  try {
    body = (await req.json()) as WatiInbound;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  // 2) only inbound messages. Ack everything else with 200 so WATI doesn't retry
  // for 24h (it retries up to 144x on non-200).
  if (body.eventType && body.eventType !== "message") {
    return NextResponse.json({ ok: true, ignored: `eventType=${body.eventType}` });
  }
  if (body.owner === true) {
    return NextResponse.json({ ok: true, ignored: "own_outbound" });
  }
  const waId = (body.waId || "").trim();
  if (!waId) {
    return NextResponse.json({ ok: true, ignored: "no_waId" });
  }

  // STOP word -> full unsubscribe; anything else a human said -> stop nurture.
  const reason = body.type === "text" ? classifyInbound(body.text || "") : OPT_OUT.reply;
  const key = phoneKey(waId);

  let result;
  try {
    result = await setOptOut({ phoneKey: key }, reason);
  } catch (e) {
    // Never make WATI retry on our internal failure — log and 200.
    console.error("[wati/webhook] setOptOut failed:", e);
    await notifySlack(`:warning: WATI inbound from ${waId} — failed to record opt-out: ${(e as Error).message}`).catch(() => {});
    return NextResponse.json({ ok: false, error: "internal", recorded: false });
  }

  const who = result.name || body.senderName || waId;
  const preview = (body.text || "").slice(0, 140).replace(/\n/g, " ");

  if (!result.found) {
    // A message from someone not in our sheet — nothing to stop, but surface it.
    await notifySlack(`:speech_balloon: WhatsApp from *${who}* (${waId}, not in sheet): "${preview}"`).catch(() => {});
    return NextResponse.json({ ok: true, matched: false });
  }

  if (reason === OPT_OUT.unsubscribe) {
    await notifySlack(
      `:no_bell: *${who}* sent a STOP word on WhatsApp — *unsubscribed, all messages stopped*. Message: "${preview}"`,
    ).catch(() => {});
  } else {
    const note = result.alreadyOut
      ? `already unsubscribed — left as-is`
      : `*follow-ups stopped* (they replied)`;
    await notifySlack(
      `:speech_balloon: *${who}* replied on WhatsApp — ${note}. Message: "${preview}"`,
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, matched: true, reason, alreadyOut: !!result.alreadyOut });
}

// A GET makes dashboard "test webhook" buttons and humans poking the URL get a
// friendly 200 instead of a scary error.
export async function GET() {
  return NextResponse.json({ ok: true, service: "wati-inbound-webhook" });
}
