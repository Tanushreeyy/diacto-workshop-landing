// Orchestration: the booking workflow logic. Reads/writes the sheet and drives
// WhatsApp (WATI), email (Graph) and Slack. All state lives in the sheet, so
// every operation is idempotent — safe to call the tick twice.

import crypto from "crypto";
import { env } from "./env";
import { WORKSHOP, WA_TEMPLATES, WA_NURTURE_LADDER } from "./config";
import {
  readTable,
  updateRow,
  appendRow,
  cell,
  Table,
  SheetRow,
} from "./google";
import { sendMail } from "./graph";
import { sendTemplate } from "./wati";
import { notifySlack } from "./slack";
import { generatePass, generatePassBase64 } from "./pass";
import { emailFor, waParamsFor, MsgCtx } from "./messages";
import { dueForNurture, dueReminders, isQuietHours, nowIso } from "./schedule";

// Column header names (must match the sheet).
const C = {
  fullName: "full_name",
  email: "email",
  phone: "phone",
  company: "company_name",
  regId: "reg_id",
  token: "confirm_token",
  done: "registration_complete",
  bookedAt: "booked_at",
  nurtureStage: "nurture_stage",
  lastNudge: "last_nudge_at",
  passSent: "pass_sent_at",
  remindersSent: "reminders_sent",
} as const;

const isDone = (v: string) => (v || "").trim().toUpperCase() === "TRUE";

function firstNameOf(fullName: string): string {
  const n = (fullName || "").trim().split(/\s+/)[0];
  return n && !n.startsWith("<") ? n : "there";
}

function genToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

function genRegId(): string {
  const n = crypto.randomInt(0, 10000).toString().padStart(4, "0");
  return `${WORKSHOP.regIdPrefix}-${WORKSHOP.eventMMDD}-${n}`;
}

export function bookingLink(token: string): string {
  return `${env.landingBaseUrl()}/?rid=${encodeURIComponent(token)}`;
}

// Skip Meta's dummy test leads so we never message placeholder data.
function isTestLead(table: Table, row: SheetRow): boolean {
  const email = cell(table, row, C.email).toLowerCase();
  const name = cell(table, row, C.fullName);
  return email === "test@meta.com" || name.includes("<test");
}

function passUrl(token: string): string {
  return `${env.landingBaseUrl()}/api/pass?rid=${encodeURIComponent(token)}`;
}

function ctxFor(table: Table, row: SheetRow, token: string): MsgCtx {
  return {
    firstName: firstNameOf(cell(table, row, C.fullName)),
    bookingLink: bookingLink(token),
    passUrl: passUrl(token),
    regId: cell(table, row, C.regId) || undefined,
    dateLabel: WORKSHOP.dateLabel,
    timeLabel: WORKSHOP.timeLabel,
    venue: WORKSHOP.venue,
    mapUrl: WORKSHOP.mapUrl,
    support: WORKSHOP.supportNumber,
  };
}

// ---- Ingest: brand-new lead → assign token, send WA-1 + EM-0a ----
async function ingestLead(table: Table, row: SheetRow): Promise<void> {
  const token = genToken();
  const ctx = ctxFor(table, row, token);
  const email = cell(table, row, C.email);
  const phone = cell(table, row, C.phone);

  // Persist token FIRST so the lead is never re-ingested even if a send fails.
  await updateRow(row.rowNumber, table, {
    [C.token]: token,
    [C.nurtureStage]: "0",
    [C.lastNudge]: nowIso(),
  });

  if (phone) {
    try {
      await sendTemplate({
        whatsappNumber: phone,
        templateName: WA_TEMPLATES.WA1,
        parameters: waParamsFor(WA_TEMPLATES.WA1, ctx),
      });
    } catch (e) {
      console.error(`[ingest] WA-1 failed for row ${row.rowNumber}:`, e);
    }
  }
  if (email) {
    try {
      const { subject, html } = emailFor("EM0A", ctx);
      await sendMail({ to: email, subject, html });
    } catch (e) {
      console.error(`[ingest] EM-0a failed for row ${row.rowNumber}:`, e);
    }
  }
}

// ---- Nurture: pending lead due for a twice-daily touch (WA ladder + EM-0) ----
async function nurtureLead(table: Table, row: SheetRow): Promise<void> {
  const token = cell(table, row, C.token);
  const ctx = ctxFor(table, row, token);
  const stage = parseInt(cell(table, row, C.nurtureStage) || "0", 10) || 0;
  const tpl = WA_NURTURE_LADDER[Math.min(stage, WA_NURTURE_LADDER.length - 1)];
  const email = cell(table, row, C.email);
  const phone = cell(table, row, C.phone);

  if (phone) {
    try {
      await sendTemplate({
        whatsappNumber: phone,
        templateName: tpl,
        parameters: waParamsFor(tpl, ctx),
      });
    } catch (e) {
      console.error(`[nurture] WA failed for row ${row.rowNumber}:`, e);
    }
  }
  if (email) {
    try {
      const { subject, html } = emailFor("EM0", ctx);
      await sendMail({ to: email, subject, html });
    } catch (e) {
      console.error(`[nurture] EM-0 failed for row ${row.rowNumber}:`, e);
    }
  }
  await updateRow(row.rowNumber, table, {
    [C.nurtureStage]: String(stage + 1),
    [C.lastNudge]: nowIso(),
  });
}

// ---- Confirm: booking gate flipped → WA-6 + EM-1 (pass) ----
async function confirmRow(table: Table, row: SheetRow): Promise<{ regId: string; name: string }> {
  const existingRegId = cell(table, row, C.regId);
  const regId = existingRegId || genRegId();
  const token = cell(table, row, C.token) || genToken();
  const name = cell(table, row, C.fullName) || "Guest";
  const company = cell(table, row, C.company) || "";
  const email = cell(table, row, C.email);
  const phone = cell(table, row, C.phone);
  const ctx = { ...ctxFor(table, row, token), regId };

  // Flip the gate + stamp everything first (idempotent guard).
  await updateRow(row.rowNumber, table, {
    [C.done]: "TRUE",
    [C.bookedAt]: nowIso(),
    [C.regId]: regId,
    [C.token]: token,
    [C.passSent]: nowIso(),
  });

  // WA-5 confirmation
  if (phone) {
    try {
      await sendTemplate({
        whatsappNumber: phone,
        templateName: WA_TEMPLATES.WA5,
        parameters: waParamsFor(WA_TEMPLATES.WA5, ctx),
      });
    } catch (e) {
      console.error(`[confirm] WA-6 failed for row ${row.rowNumber}:`, e);
    }
  }
  // EM-1 with the generated pass
  if (email) {
    try {
      const pass = await generatePassBase64({ name, company, regId });
      const { subject, html } = emailFor("EM1", ctx);
      await sendMail({
        to: email,
        subject,
        html,
        attachments: [
          {
            name: `Event_Pass_${firstNameOf(name)}.pdf`,
            contentBytes: pass,
            contentType: "application/pdf",
          },
        ],
      });
    } catch (e) {
      console.error(`[confirm] EM-1 failed for row ${row.rowNumber}:`, e);
    }
  }

  await notifySlack(
    `:tada: *Booking confirmed* — ${name}${company ? ` (${company})` : ""} · Reg ID ${regId}`,
  );
  return { regId, name };
}

// ---- Reminders: booked lead, EM-2/3/4 (+ optional WA reminders) ----
async function remindLead(table: Table, row: SheetRow): Promise<number> {
  const sentCsv = cell(table, row, C.remindersSent);
  const due = dueReminders(sentCsv);
  if (!due.length) return 0;
  const token = cell(table, row, C.token);
  const regId = cell(table, row, C.regId);
  const ctx = { ...ctxFor(table, row, token), regId: regId || undefined };
  const email = cell(table, row, C.email);
  const phone = cell(table, row, C.phone);
  const company = cell(table, row, C.company) || "";
  const name = cell(table, row, C.fullName) || "Guest";

  const sent = new Set(sentCsv.split(",").map((s) => s.trim()).filter(Boolean));
  let count = 0;

  for (const r of due) {
    try {
      if (r.kind === "email") {
        const kind = r.key === "EM2" ? "EM2" : r.key === "EM3" ? "EM3" : "EM4";
        const { subject, html } = emailFor(kind, ctx);
        const attachments = regId
          ? [
              {
                name: `Event_Pass_${firstNameOf(name)}.pdf`,
                contentBytes: await generatePassBase64({ name, company, regId }),
                contentType: "application/pdf",
              },
            ]
          : undefined;
        if (email) await sendMail({ to: email, subject, html, attachments });
      } else if (r.kind === "wa") {
        const tpl =
          r.key === "WA6"
            ? WA_TEMPLATES.WA6
            : r.key === "WA7"
              ? WA_TEMPLATES.WA7
              : WA_TEMPLATES.WA8;
        if (phone) {
          await sendTemplate({
            whatsappNumber: phone,
            templateName: tpl,
            parameters: waParamsFor(tpl, ctx),
          });
        }
      }
      sent.add(r.key);
      count++;
    } catch (e) {
      console.error(`[remind] ${r.key} failed for row ${row.rowNumber}:`, e);
    }
  }

  if (count) {
    await updateRow(row.rowNumber, table, {
      [C.remindersSent]: Array.from(sent).join(","),
    });
  }
  return count;
}

export interface TickSummary {
  ingested: number;
  nurtured: number;
  remindersSent: number;
  scanned: number;
  errors: string[];
}

// The hourly tick — the whole scheduled engine.
export async function runTick(): Promise<TickSummary> {
  const table = await readTable();
  const summary: TickSummary = {
    ingested: 0,
    nurtured: 0,
    remindersSent: 0,
    scanned: table.rows.length,
    errors: [],
  };
  const quiet = isQuietHours();

  for (const row of table.rows) {
    const email = cell(table, row, C.email);
    const phone = cell(table, row, C.phone);
    if (!email && !phone) continue; // empty row
    if (isTestLead(table, row)) continue;

    const done = isDone(cell(table, row, C.done));
    const token = cell(table, row, C.token);

    try {
      if (done) {
        // Booked → reminders only.
        summary.remindersSent += await remindLead(table, row);
      } else if (!token) {
        // Brand-new lead → ingest (send WA-1 + EM-0a) regardless of quiet hours,
        // since this is the immediate acknowledgement of their submission.
        await ingestLead(table, row);
        summary.ingested++;
      } else if (!quiet && dueForNurture(cell(table, row, C.lastNudge))) {
        await nurtureLead(table, row);
        summary.nurtured++;
      }
    } catch (e) {
      const msg = `row ${row.rowNumber}: ${(e as Error).message}`;
      summary.errors.push(msg);
      console.error("[tick]", msg);
    }
  }

  if (summary.ingested || summary.errors.length) {
    await notifySlack(
      `:gear: Tick — ingested ${summary.ingested}, nurtured ${summary.nurtured}, reminders ${summary.remindersSent}` +
        (summary.errors.length ? `, *${summary.errors.length} errors*` : ""),
    );
  }
  return summary;
}

// ---- Confirm entry points (called by /api/confirm) ----

export async function confirmByToken(
  token: string,
): Promise<{ ok: boolean; already?: boolean; name?: string; regId?: string; error?: string }> {
  const table = await readTable();
  const row = table.rows.find((r) => cell(table, r, C.token) === token);
  if (!row) return { ok: false, error: "not_found" };
  if (isDone(cell(table, row, C.done))) {
    return { ok: true, already: true, name: cell(table, row, C.fullName), regId: cell(table, row, C.regId) };
  }
  const { regId, name } = await confirmRow(table, row);
  return { ok: true, name, regId };
}

export async function confirmOrganic(input: {
  name: string;
  email: string;
  phone: string;
  company?: string;
}): Promise<{ ok: boolean; name: string; regId?: string; error?: string }> {
  const table = await readTable();
  // De-dupe: if this email/phone already exists, confirm that row instead.
  const existing = table.rows.find(
    (r) =>
      (input.email && cell(table, r, C.email).toLowerCase() === input.email.toLowerCase()) ||
      (input.phone && cell(table, r, C.phone).replace(/\D/g, "") === input.phone.replace(/\D/g, "")),
  );
  if (existing) {
    if (isDone(cell(table, existing, C.done))) {
      return { ok: true, name: cell(table, existing, C.fullName), regId: cell(table, existing, C.regId) };
    }
    const { regId, name } = await confirmRow(table, existing);
    return { ok: true, name, regId };
  }

  const token = genToken();
  const rowNumber = await appendRow(table, {
    [C.fullName]: input.name,
    [C.email]: input.email,
    [C.phone]: input.phone,
    [C.company]: input.company ?? "",
    [C.token]: token,
    is_organic: "true",
    lead_status: "Organic",
  });
  // Re-read so the new row is in the table for confirmRow.
  const table2 = await readTable();
  const row = table2.rows.find((r) => r.rowNumber === rowNumber) ??
    table2.rows.find((r) => cell(table2, r, C.token) === token);
  if (!row) return { ok: false, name: input.name, error: "append_failed" };
  const { regId, name } = await confirmRow(table2, row);
  return { ok: true, name, regId };
}

// Regenerate the pass PDF for a token (powers GET /api/pass + WhatsApp link).
export async function passPdfForToken(
  token: string,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const table = await readTable();
  const row = table.rows.find((r) => cell(table, r, C.token) === token);
  if (!row) return null;
  const regId = cell(table, row, C.regId);
  if (!regId) return null; // pass not issued until the booking is confirmed
  const name = cell(table, row, C.fullName) || "Guest";
  const company = cell(table, row, C.company) || "";
  const bytes = await generatePass({ name, company, regId });
  return { bytes, filename: `Event_Pass_${firstNameOf(name)}.pdf` };
}
