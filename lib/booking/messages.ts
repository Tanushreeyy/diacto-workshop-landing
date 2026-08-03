import { WORKSHOP } from "./config";
// Message content: renders the designed email templates + maps WhatsApp
// template variables. Email HTML/subjects live in email-templates/*.html and are
// bundled into emailTemplates.ts via `npm run build-emails`.


import { EMAIL_TEMPLATES, type EmailKey } from "./emailTemplates";
import type { WaParam } from "./wati";

export type { EmailKey };

export interface MsgCtx {
  firstName: string;
  bookingLink: string; // tokenised confirm link
  passUrl?: string; // tokenised pass-download link (issued after confirm)
  unsubscribeUrl?: string; // tokenised one-click unsubscribe (confirm page)
  regId?: string;
  dateLabel: string;
  dateShort: string; // "Fri, 24 July" — weekday+date, the WhatsApp date variable
  timeLabel: string;
  venue: string;
  mapUrl: string;
  support: string;
}

// Fallback only. Real emails carry a per-lead tokenised link (ctx.unsubscribeUrl)
// that opts them out in one click via a confirm page — a mailto forces them to
// compose an email nobody may action, and stops nothing automatically.
const UNSUBSCRIBE_FALLBACK = `mailto:${WORKSHOP.unsubscribeEmail}?subject=Unsubscribe%20-%20Workshop`;

// Render a designed email template with this lead's values.
export function emailFor(kind: EmailKey, ctx: MsgCtx): { subject: string; html: string } {
  const tpl = EMAIL_TEMPLATES[kind];
  const vars: Record<string, string> = {
    First_Name: ctx.firstName,
    Booking_Link: ctx.bookingLink,
    // The tokenised pass-download link (issued after confirm). Used by the reschedule
    // notice (EM-9) so attendees can pull a fresh pass carrying the new date. Falls
    // back to the booking link if a pass URL wasn't threaded through.
    Updated_Pass_Link: ctx.passUrl ?? ctx.bookingLink,
    Map_Link: ctx.mapUrl,
    Support_Number: ctx.support,
    Unsubscribe_Link: ctx.unsubscribeUrl ?? UNSUBSCRIBE_FALLBACK,
    // The workshop date was hardcoded in the email HTML; now it's a variable driven
    // by the same single source as everything else (EVENT_DATE_LABEL / _SHORT), so a
    // postponement is one env var across WhatsApp, the landing page AND the emails.
    Event_Date: ctx.dateLabel,
    Event_Date_Short: ctx.dateShort,
  };
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
  return { subject: fill(tpl.subject), html: fill(tpl.html) };
}

// WhatsApp template body-variable maps. The venue map + support number are STATIC
// in the templates (a "Get Directions" URL button + hardcoded text). The variables:
//   WA-1…WA-5 : {{1}} first name · {{2}} date ("Fri, 24 July") · {{3}} link/pass
//   WA-6…WA-8 : {{1}} first name · {{2}} Event Pass link   (relative time, no date)
// The date lives in {{2}} — weekday and date together — so postponing the workshop
// is a single env var (EVENT_DATE_SHORT) and never a template rebuild.
/**
 * Which message in the ladder this is — NOT which template name is configured.
 *
 * This used to be decided by matching the template name against WA_TEMPLATES.
 * That tied variable ORDER to campaign CONFIG: point WATI_TPL_WA8 at a name the
 * constant didn't know (as production did — WATI_TPL_WA8=wa_two_hour) and the
 * match failed, so the message silently fell to the 2-variable branch. It worked
 * only because WA-8 genuinely takes 2. A campaign whose WA-5 name was unrecognised
 * would have sent the pass link where the date belonged.
 *
 * The caller always knows which rung it is sending. So it says so.
 */
export type WaRole = "wa1" | "wa2" | "wa3" | "wa4" | "wa5" | "wa6" | "wa7" | "wa8";

export function waParamsFor(role: WaRole, ctx: MsgCtx): WaParam[] {
  const fn: WaParam = { name: "1", value: ctx.firstName };
  // WA-1..4 (not yet registered) point at the registration link;
  // WA-5..8 (registered) point at the Event Pass download.
  const isPreRegistration = role === "wa1" || role === "wa2" || role === "wa3" || role === "wa4";
  const link = isPreRegistration ? ctx.bookingLink : (ctx.passUrl ?? ctx.bookingLink);

  // WA-1…WA-5 print the date, so it rides as {{2}} and the link shifts to {{3}}.
  const carriesDate = isPreRegistration || role === "wa5";
  if (carriesDate) {
    return [fn, { name: "2", value: ctx.dateShort }, { name: "3", value: link }];
  }
  return [fn, { name: "2", value: link }];
}
