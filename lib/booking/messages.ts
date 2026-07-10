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

// WhatsApp template body-variable maps. The venue map + support number are
// STATIC (a static "Get Directions" URL button + hardcoded text in the template),
// so the only body variables are the first name and a dynamic link:
//   WA-1…WA-4 : {{1}} first name · {{2}} booking link
//   WA-5…WA-8 : {{1}} first name · {{2}} Event Pass download link
export function waParamsFor(templateName: string, ctx: MsgCtx): WaParam[] {
  const fn: WaParam = { name: "1", value: ctx.firstName };
  const bookingLink: WaParam = { name: "2", value: ctx.bookingLink };
  const passLink: WaParam = { name: "2", value: ctx.passUrl ?? ctx.bookingLink };

  switch (templateName) {
    case WA_TEMPLATES.WA1:
    case WA_TEMPLATES.WA2:
    case WA_TEMPLATES.WA3:
    case WA_TEMPLATES.WA4:
      return [fn, bookingLink];
    default:
      return [fn, passLink];
  }
}
