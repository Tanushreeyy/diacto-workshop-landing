// Message content: email subjects/HTML + WhatsApp template parameter maps.
// WhatsApp bodies live in the approved WATI templates; here we only supply the
// ordered {{1}},{{2}}… variable values. Email copy is condensed from the
// client's template doc and can be edited freely without touching logic.

import { WORKSHOP } from "./config";
import type { WaParam } from "./wati";

export interface MsgCtx {
  firstName: string;
  bookingLink: string; // tokenised confirm link
  passUrl?: string; // tokenised pass-download link (issued after confirm)
  regId?: string;
  dateLabel: string;
  timeLabel: string;
  venue: string;
  mapUrl: string;
  support: string;
}

export type EmailKind = "EM0A" | "EM0" | "EM1" | "EM2" | "EM3" | "EM4";

const BLACK = "#0B1E33";
const GOLD = "#C0913C";

function shell(preheader: string, inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f2ec;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ec;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
        style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Segoe UI,Arial,sans-serif;color:#182430;">
        <tr><td style="background:${BLACK};padding:20px 28px;">
          <div style="color:${GOLD};font-size:12px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;">Diacto Technologies</div>
          <div style="color:#fff;font-size:18px;font-weight:700;margin-top:2px;">High-Performance Teams Workshop</div>
        </td></tr>
        <tr><td style="padding:26px 28px 8px;">${inner}</td></tr>
        <tr><td style="padding:8px 28px 26px;color:#5d6b7a;font-size:12px;line-height:1.6;">
          <hr style="border:none;border-top:1px solid #e6e2d8;margin:0 0 12px;"/>
          ${WORKSHOP.fromName} · ${WORKSHOP.supportNumber} · ${WORKSHOP.website}<br/>
          Great Teams Build Great Businesses.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${GOLD};color:${BLACK};font-weight:700;text-decoration:none;padding:13px 26px;border-radius:999px;font-size:15px;">${label}</a>`;
}

function detailsBlock(ctx: MsgCtx): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#fbfaf6;border:1px solid #e6e2d8;border-radius:10px;margin:16px 0;">
    <tr><td style="padding:14px 16px;font-size:14px;line-height:1.7;">
      📅 <b>${ctx.dateLabel}</b><br/>
      🕒 ${ctx.timeLabel}<br/>
      📍 ${ctx.venue} · <a href="${ctx.mapUrl}" style="color:${GOLD};">Directions</a>
    </td></tr></table>`;
}

export function emailFor(kind: EmailKind, ctx: MsgCtx): { subject: string; html: string } {
  const hi = `Hi ${ctx.firstName},`;
  switch (kind) {
    case "EM0A":
      return {
        subject: `⚠️ ${ctx.firstName}, your seat is on hold — 1 step left to confirm`,
        html: shell(
          "You're 30 seconds away from confirming your FREE seat.",
          `<p>${hi}</p>
           <p>Thanks for your interest in the <b>High-Performance Teams Workshop</b> — a FREE business-growth workshop for Founders &amp; Business Owners. Your seat is <b>on hold, not yet confirmed</b>.</p>
           ${detailsBlock(ctx)}
           <p>${btn(ctx.bookingLink, "CONFIRM MY FREE SEAT →")}</p>
           <p style="color:#5d6b7a;font-size:13px;">Seats are limited and first-come. Your Event Pass is emailed the moment you confirm.</p>`,
        ),
      };
    case "EM0":
      return {
        subject: `Your seat for Friday's workshop is about to be released, ${ctx.firstName}`,
        html: shell(
          "One step left to confirm your FREE seat.",
          `<p>${hi}</p>
           <p>We noticed you haven't confirmed your seat yet — it's still <b>on hold</b>. This is a business-growth workshop, not HR theory: the A.S.K. framework, a scientific hiring system, and accountability systems that reduce founder dependency.</p>
           ${detailsBlock(ctx)}
           <p>${btn(ctx.bookingLink, "CONFIRM MY FREE SEAT →")}</p>
           <p style="color:#5d6b7a;font-size:13px;">Once you confirm, your Event Pass (PDF) is emailed instantly.</p>`,
        ),
      };
    case "EM1":
      return {
        subject: `✅ Confirmed! Your Event Pass — High-Performance Teams Workshop (Fri, 17 July)`,
        html: shell(
          "Your seat is booked. Your Event Pass is attached.",
          `<p>${hi}</p>
           <p><b>Congratulations — your seat is confirmed! 🎉</b> Your Event Pass is attached to this email — carry it (digital or print) for entry.</p>
           ${detailsBlock(ctx)}
           ${ctx.passUrl ? `<p>${btn(ctx.passUrl, "📎 Download your Event Pass")}</p>` : ""}
           ${ctx.regId ? `<p style="font-size:14px;">Registration ID: <b>${ctx.regId}</b></p>` : ""}
           <p style="font-size:14px;">Check-in opens 2:30 PM — arrive by 2:45 PM for a smooth entry. Our team will call you shortly to confirm your attendance.</p>
           <p style="color:#5d6b7a;font-size:13px;">Attachment: Event_Pass_${ctx.firstName}.pdf</p>`,
        ),
      };
    case "EM2":
      return {
        subject: `⏰ Tomorrow, 3 PM: Your High-Performance Teams Workshop (Baner, Pune)`,
        html: shell(
          "Your seat is confirmed for tomorrow. Everything you need inside.",
          `<p>${hi}</p>
           <p>Just one day to go! Tomorrow you'll learn the exact systems high-growth founders use to hire, train, manage and retain high-performance teams.</p>
           ${detailsBlock(ctx)}
           <p style="font-size:14px;">Carry your Event Pass (attached again for convenience). See you tomorrow at 3:00 PM sharp.</p>`,
        ),
      };
    case "EM3":
      return {
        subject: `🚀 Today's the day, ${ctx.firstName} — Workshop at 3 PM (Baner, Pune)`,
        html: shell(
          "Check-in opens 2:30 PM. Carry your Event Pass. Directions inside.",
          `<p>Good morning ${ctx.firstName},</p>
           <p>Today you invest 3 hours in the one asset that decides how fast your business grows — your team.</p>
           ${detailsBlock(ctx)}
           <p style="font-size:14px;">Check-in opens 2:30 PM — arrive by 2:45 PM. Show your Event Pass (attached) at the desk. Baner traffic can be unpredictable on Friday afternoons, so leave a little early.</p>`,
        ),
      };
    case "EM4":
      return {
        subject: `⏳ Starting in 2 hours — High-Performance Teams Workshop | 3:00 PM, Baner`,
        html: shell(
          "Doors open 2:30 PM. Your seat is waiting.",
          `<p>${hi}</p>
           <p>We go live in 2 hours! Doors open 2:30 PM, session starts 3:00 PM sharp.</p>
           ${detailsBlock(ctx)}
           <p style="font-size:14px;">Entry: your Event Pass (attached). Running late or need help finding the venue? Call/WhatsApp ${ctx.support}.</p>`,
        ),
      };
  }
}

// WhatsApp template variable maps. These must line up with the {{1}},{{2}}…
// placeholders in the corresponding approved WATI template.
export function waParamsFor(templateName: string, ctx: MsgCtx): WaParam[] {
  const fn: WaParam = { name: "1", value: ctx.firstName };
  const link: WaParam = { name: "2", value: ctx.bookingLink };
  const map: WaParam = { name: "2", value: ctx.mapUrl };
  const support: WaParam = { name: "2", value: ctx.support };
  const pass: WaParam = { name: "2", value: ctx.passUrl || ctx.mapUrl };

  // WA-6 confirmation carries the pass-download link ({{2}}); reminders carry
  // the map/support; nurture carries the booking link. Adjust here if a template
  // uses a different variable order.
  if (templateName.includes("_6_") || templateName.includes("confirmation")) return [fn, pass];
  if (templateName.includes("_r1_") || templateName.includes("morning")) return [fn, map];
  if (templateName.includes("_r2_") || templateName.includes("two_hour")) return [fn, support];
  return [fn, link];
}
