// Message content: renders the designed email templates + maps WhatsApp
// template variables. Email HTML/subjects live in email-templates/*.html and are
// bundled into emailTemplates.ts via `npm run build-emails`.

import { WA_TEMPLATES } from "./config";
import { EMAIL_TEMPLATES, type EmailKey } from "./emailTemplates";
import type { WaParam } from "./wati";

export type { EmailKey };

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

const UNSUBSCRIBE_LINK = "mailto:workshop@diacto.com?subject=Unsubscribe%20-%20Workshop";

// Render a designed email template with this lead's values.
export function emailFor(kind: EmailKey, ctx: MsgCtx): { subject: string; html: string } {
  const tpl = EMAIL_TEMPLATES[kind];
  const vars: Record<string, string> = {
    First_Name: ctx.firstName,
    Booking_Link: ctx.bookingLink,
    Map_Link: ctx.mapUrl,
    Support_Number: ctx.support,
    Unsubscribe_Link: UNSUBSCRIBE_LINK,
  };
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
  return { subject: fill(tpl.subject), html: fill(tpl.html) };
}

// WhatsApp template variable maps. These must line up with the {{1}},{{2}}…
// placeholders in the corresponding approved WATI template.
//   WA-1…WA-4 : {{1}} first name · {{2}} booking link · {{3}} location link
//   WA-5/6/7  : {{1}} first name · {{2}} location link
//   WA-8      : {{1}} first name · {{2}} location link · {{3}} support number
export function waParamsFor(templateName: string, ctx: MsgCtx): WaParam[] {
  const fn: WaParam = { name: "1", value: ctx.firstName };
  const bookingLink: WaParam = { name: "2", value: ctx.bookingLink };
  const mapAt2: WaParam = { name: "2", value: ctx.mapUrl };
  const mapAt3: WaParam = { name: "3", value: ctx.mapUrl };
  const supportAt3: WaParam = { name: "3", value: ctx.support };

  switch (templateName) {
    case WA_TEMPLATES.WA1:
    case WA_TEMPLATES.WA2:
    case WA_TEMPLATES.WA3:
    case WA_TEMPLATES.WA4:
      return [fn, bookingLink, mapAt3];
    case WA_TEMPLATES.WA5:
    case WA_TEMPLATES.WA6:
    case WA_TEMPLATES.WA7:
      return [fn, mapAt2];
    case WA_TEMPLATES.WA8:
      return [fn, mapAt2, supportAt3];
    default:
      return [fn, bookingLink];
  }
}
