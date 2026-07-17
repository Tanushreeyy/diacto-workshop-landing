import { NextRequest, NextResponse } from "next/server";
import { readTable } from "@/lib/booking/google";
import { env } from "@/lib/booking/env";
import {
  setOptOut,
  clearOptOut,
  optOutStateForToken,
} from "@/lib/booking/service";
import { OPT_OUT } from "@/lib/booking/config";
import { notifySlack } from "@/lib/booking/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-click email unsubscribe — and its undo.
//
// CRITICAL: GET must NOT opt anyone out. Outlook/Gmail Safe Links and inbox
// scanners PREFETCH every href in an email, so a GET that mutated state would
// unsubscribe people who never clicked. GET only renders a confirm page; the
// POST behind its button is what actually opts out. RFC 8058 one-click
// (List-Unsubscribe-Post) is the sole POST-without-confirm path, and mail
// clients only send that on a real user action.

const NAVY = "#0B1E33";
const GOLD = "#D9A441";
const CREAM = "#EEEBE4";

function page(opts: {
  title: string;
  heading: string;
  body: string;
  action?: { label: string; rid: string; kind: "unsubscribe" | "resubscribe" };
}): string {
  const btn = opts.action
    ? `<form method="POST" action="/api/unsubscribe" style="margin-top:22px;">
         <input type="hidden" name="rid" value="${escapeAttr(opts.action.rid)}">
         <input type="hidden" name="do" value="${opts.action.kind}">
         <button type="submit" style="background:${opts.action.kind === "unsubscribe" ? NAVY : GOLD};color:${opts.action.kind === "unsubscribe" ? "#fff" : NAVY};border:none;border-radius:8px;padding:14px 34px;font:600 15px Arial,sans-serif;cursor:pointer;">${escapeHtml(opts.action.label)}</button>
       </form>`
    : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif;color:#1A2433;">
<div style="max-width:520px;margin:8vh auto;padding:0 20px;">
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 14px rgba(11,30,51,.1);">
    <div style="background:${NAVY};padding:22px 28px;">
      <p style="margin:0;letter-spacing:2px;font-size:13px;color:${GOLD};font-weight:bold;">HIGH-PERFORMANCE TEAMS WORKSHOP</p>
    </div>
    <div style="padding:30px 28px;">
      <h1 style="margin:0 0 12px;font-size:21px;color:${NAVY};">${escapeHtml(opts.heading)}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;">${opts.body}</p>
      ${btn}
    </div>
  </div>
  <p style="text-align:center;font-size:12px;color:#5F7690;margin-top:16px;">Diacto Technologies Pvt Ltd, Pune</p>
</div></body></html>`;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const escapeAttr = escapeHtml;

const html = (s: string, status = 200) =>
  new NextResponse(s, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

// GET — render the confirm page. Never mutates.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rid = url.searchParams.get("rid");
  const resub = url.searchParams.get("resubscribe") === "1";
  if (!rid) {
    return html(page({ title: "Unsubscribe", heading: "Link incomplete", body: "This link is missing its identifier. Please use the link from your email." }), 400);
  }

  // Look up their current state so the page reflects reality.
  let state: { found: boolean; name?: string; optedOut?: string };
  try {
    const auto = await readTable(env.autoTab());
    state = optOutStateForToken(auto, rid);
  } catch {
    return html(page({ title: "Unsubscribe", heading: "Something went wrong", body: "We couldn't reach our records just now. Please try again in a minute." }), 500);
  }
  if (!state.found) {
    return html(page({ title: "Unsubscribe", heading: "Link not recognised", body: "We couldn't find this subscription. It may have already been removed." }), 404);
  }
  const name = escapeHtml(state.name || "there");

  if (resub) {
    if (!state.optedOut) {
      return html(page({ title: "Subscribed", heading: `You're already subscribed, ${name}`, body: "You'll keep receiving updates about the workshop. Nothing to do." }));
    }
    return html(page({
      title: "Resubscribe",
      heading: `Resume updates, ${name}?`,
      body: "We'll start sending you workshop updates and reminders again.",
      action: { label: "Yes, resubscribe me", rid, kind: "resubscribe" },
    }));
  }

  if (state.optedOut) {
    return html(page({
      title: "Already unsubscribed",
      heading: `You're already unsubscribed, ${name}`,
      body: `You won't receive further messages. Changed your mind? <a href="/api/unsubscribe?rid=${escapeAttr(rid)}&resubscribe=1" style="color:${NAVY};">Resubscribe here</a>.`,
    }));
  }
  return html(page({
    title: "Unsubscribe",
    heading: `Unsubscribe, ${name}?`,
    body: "You'll stop receiving all workshop messages — reminders included. You can resubscribe any time.",
    action: { label: "Yes, unsubscribe me", rid, kind: "unsubscribe" },
  }));
}

// POST — the actual mutation, from the confirm button OR RFC 8058 one-click.
export async function POST(req: NextRequest) {
  let rid = "";
  let action = "unsubscribe";
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const j = await req.json();
      rid = j.rid || "";
      action = j.do || "unsubscribe";
    } else {
      const f = await req.formData();
      rid = String(f.get("rid") || "");
      action = String(f.get("do") || "unsubscribe");
    }
  } catch {
    /* fall through to missing-rid */
  }
  // RFC 8058: mail clients POST "List-Unsubscribe=One-Click" with the rid in the
  // URL. Honour that as an unsubscribe even with no body fields.
  if (!rid) rid = new URL(req.url).searchParams.get("rid") || "";
  if (!rid) return html(page({ title: "Unsubscribe", heading: "Link incomplete", body: "This request is missing its identifier." }), 400);

  if (action === "resubscribe") {
    const r = await clearOptOut(rid);
    if (!r.found) return html(page({ title: "Resubscribe", heading: "Link not recognised", body: "We couldn't find this subscription." }), 404);
    const name = escapeHtml(r.name || "there");
    notifySlack(`:bell: *${r.name || "A lead"}* resubscribed — reminders/updates resume.`).catch(() => {});
    return html(page({ title: "Subscribed", heading: `Welcome back, ${name}`, body: "You'll receive workshop updates and reminders again." }));
  }

  const r = await setOptOut({ token: rid }, OPT_OUT.unsubscribe);
  if (!r.found) return html(page({ title: "Unsubscribe", heading: "Link not recognised", body: "We couldn't find this subscription. It may already be removed." }), 404);
  const name = escapeHtml(r.name || "there");
  notifySlack(`:no_bell: *${r.name || "A lead"}* unsubscribed via email — all messages stopped.`).catch(() => {});
  return html(page({
    title: "Unsubscribed",
    heading: `Done, ${name} — you're unsubscribed`,
    body: `You won't receive any further workshop messages. Changed your mind? <a href="/api/unsubscribe?rid=${escapeAttr(rid)}&resubscribe=1" style="color:${NAVY};">Resubscribe here</a>.`,
  }));
}
