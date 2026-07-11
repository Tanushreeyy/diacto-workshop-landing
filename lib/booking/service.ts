// Orchestration: the booking workflow.
//
// Two tabs:
//   • form tab (v2_form)   — owned by Meta's connector. READ ONLY.
//   • automation tab       — all our state, keyed by the form's `lead_id`.
// Keeping state off the form tab means a form/connector change can never shift
// or clobber booking state. Every operation is idempotent — the tick is safe to
// run twice, and missed ticks self-heal on the next run.

import crypto from "crypto";
import { env } from "./env";
import { WORKSHOP, WA_TEMPLATES, WA_NURTURE_LADDER } from "./config";
import {
  readTable,
  updateRow,
  appendRow,
  cell,
  resolveHeader,
  Table,
  SheetRow,
} from "./google";
import { sendMail } from "./graph";
import { sendTemplate } from "./wati";
import { notifySlack } from "./slack";
import { generatePass, generatePassBase64 } from "./pass";
import { emailFor, waParamsFor, MsgCtx } from "./messages";
import { dueForNurture, dueReminders, isQuietHours, nowIso } from "./schedule";

// ---- automation tab columns (ours) ----
const A = {
  leadId: "lead_id",
  name: "name",
  email: "email",
  phone: "phone",
  company: "company",
  regId: "reg_id",
  token: "confirm_token",
  done: "registration_complete",
  bookedAt: "booked_at",
  nurtureStage: "nurture_stage",
  lastNudge: "last_nudge_at",
  passSent: "pass_sent_at",
  remindersSent: "reminders_sent",
  source: "source",
} as const;

// ---- form tab columns (theirs) — resolved by candidate names ----
const FORM = {
  id: ["id"],
  name: ["your_name:", "full_name", "name"],
  email: ["email", "email_address"],
  phone: ["phone", "phone_number"],
  company: ["organization_name:", "company_name", "company"],
};

const isDone = (v: string) => (v || "").trim().toUpperCase() === "TRUE";

interface LeadData {
  leadId: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  regId?: string;
}

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

function passUrl(token: string): string {
  return `${env.landingBaseUrl()}/api/pass?rid=${encodeURIComponent(token)}`;
}

// Skip Meta's dummy test leads so we never message placeholder data.
function isTestLead(l: LeadData): boolean {
  return (
    l.email.toLowerCase() === "test@meta.com" ||
    l.name.includes("<test") ||
    l.phone.includes("<test")
  );
}

function ctxFor(l: LeadData, token: string): MsgCtx {
  return {
    firstName: firstNameOf(l.name),
    bookingLink: bookingLink(token),
    passUrl: passUrl(token),
    regId: l.regId,
    dateLabel: WORKSHOP.dateLabel,
    timeLabel: WORKSHOP.timeLabel,
    venue: WORKSHOP.venue,
    mapUrl: WORKSHOP.mapUrl,
    support: WORKSHOP.supportNumber,
  };
}

function leadFromAuto(auto: Table, row: SheetRow): LeadData {
  return {
    leadId: cell(auto, row, A.leadId),
    name: cell(auto, row, A.name),
    email: cell(auto, row, A.email),
    phone: cell(auto, row, A.phone),
    company: cell(auto, row, A.company),
    regId: cell(auto, row, A.regId) || undefined,
  };
}

// ---- Ingest: new form lead → automation row + WA-1 + EM-1 ----
async function ingestLead(auto: Table, l: LeadData, source: string): Promise<void> {
  const token = genToken();
  await appendRow(auto, {
    [A.leadId]: l.leadId,
    [A.name]: l.name,
    [A.email]: l.email,
    [A.phone]: l.phone,
    [A.company]: l.company,
    [A.token]: token,
    [A.nurtureStage]: "0",
    [A.lastNudge]: nowIso(),
    [A.source]: source,
  });

  const ctx = ctxFor(l, token);
  const sent: string[] = [];
  const failed: string[] = [];

  if (l.phone) {
    try {
      await sendTemplate({
        whatsappNumber: l.phone,
        templateName: WA_TEMPLATES.WA1,
        parameters: waParamsFor(WA_TEMPLATES.WA1, ctx),
      });
      sent.push("WA-1");
    } catch (e) {
      failed.push("WA-1");
      console.error(`[ingest] WA-1 failed for ${l.leadId}:`, e);
    }
  }
  if (l.email) {
    try {
      const { subject, html } = emailFor("EM1", ctx);
      await sendMail({ to: l.email, subject, html });
      sent.push("EM-1");
    } catch (e) {
      failed.push("EM-1");
      console.error(`[ingest] EM-1 failed for ${l.leadId}:`, e);
    }
  }

  await notifySlack(
    `:inbox_tray: *New lead* — ${l.name || "Unknown"}` +
      (sent.length ? ` · sent ${sent.join(" + ")}` : "") +
      (failed.length ? ` · :warning: failed ${failed.join(", ")}` : ""),
  );
}

// ---- Nurture: twice-daily touch (WA ladder + email ladder) ----
async function nurtureLead(auto: Table, row: SheetRow): Promise<void> {
  const l = leadFromAuto(auto, row);
  const token = cell(auto, row, A.token);
  const ctx = ctxFor(l, token);
  const stage = parseInt(cell(auto, row, A.nurtureStage) || "0", 10) || 0;
  const tpl = WA_NURTURE_LADDER[Math.min(stage, WA_NURTURE_LADDER.length - 1)];
  const emailKind = stage === 0 ? "EM2" : stage === 1 ? "EM3" : "EM4";

  const sent: string[] = [];
  const failed: string[] = [];

  if (l.phone) {
    try {
      await sendTemplate({
        whatsappNumber: l.phone,
        templateName: tpl,
        parameters: waParamsFor(tpl, ctx),
      });
      sent.push(tpl);
    } catch (e) {
      failed.push(tpl);
      console.error(`[nurture] WA failed for ${l.leadId}:`, e);
    }
  }
  if (l.email) {
    try {
      const { subject, html } = emailFor(emailKind, ctx);
      await sendMail({ to: l.email, subject, html });
      sent.push(emailKind);
    } catch (e) {
      failed.push(emailKind);
      console.error(`[nurture] email failed for ${l.leadId}:`, e);
    }
  }

  await updateRow(auto, row.rowNumber, {
    [A.nurtureStage]: String(stage + 1),
    [A.lastNudge]: nowIso(),
  });

  await notifySlack(
    `:bell: *Nudge* (touch ${stage + 1}) — ${l.name || "Unknown"}` +
      (sent.length ? ` · sent ${sent.join(" + ")}` : "") +
      (failed.length ? ` · :warning: failed ${failed.join(", ")}` : ""),
  );
}

// ---- Confirm: booking gate → WA-5 + EM-5 (pass) ----
async function confirmRow(
  auto: Table,
  row: SheetRow,
): Promise<{ regId: string; name: string }> {
  const l = leadFromAuto(auto, row);
  const regId = l.regId || genRegId();
  const token = cell(auto, row, A.token) || genToken();
  const ctx = { ...ctxFor({ ...l, regId }, token), regId };

  await updateRow(auto, row.rowNumber, {
    [A.done]: "TRUE",
    [A.bookedAt]: nowIso(),
    [A.regId]: regId,
    [A.token]: token,
    [A.passSent]: nowIso(),
  });

  const sent: string[] = [];
  const failed: string[] = [];

  if (l.phone) {
    try {
      const nativeDoc = env.wa5NativeDoc();
      await sendTemplate({
        whatsappNumber: l.phone,
        templateName: WA_TEMPLATES.WA5,
        parameters: nativeDoc
          ? [{ name: "1", value: ctx.firstName }]
          : waParamsFor(WA_TEMPLATES.WA5, ctx),
        headerDocument:
          nativeDoc && ctx.passUrl
            ? { paramName: env.watiDocParam(), url: ctx.passUrl }
            : undefined,
      });
      sent.push("WA-5");
    } catch (e) {
      failed.push("WA-5");
      console.error(`[confirm] WA-5 failed for ${l.leadId}:`, e);
    }
  }
  if (l.email) {
    try {
      const pass = await generatePassBase64({
        name: l.name || "Guest",
        company: l.company,
        regId,
      });
      const { subject, html } = emailFor("EM5", ctx);
      await sendMail({
        to: l.email,
        subject,
        html,
        attachments: [
          {
            name: `Event_Pass_${firstNameOf(l.name)}.pdf`,
            contentBytes: pass,
            contentType: "application/pdf",
          },
        ],
      });
      sent.push("EM-5 (+pass)");
    } catch (e) {
      failed.push("EM-5");
      console.error(`[confirm] EM-5 failed for ${l.leadId}:`, e);
    }
  }

  await notifySlack(
    `:tada: *Booking confirmed* — ${l.name || "Guest"}${l.company ? ` (${l.company})` : ""} · Reg ID ${regId}` +
      (sent.length ? ` · sent ${sent.join(" + ")}` : "") +
      (failed.length ? ` · :warning: failed ${failed.join(", ")}` : ""),
  );
  return { regId, name: l.name || "Guest" };
}

// ---- Reminders: EM-6/7/8 + WA-6/7/8 ----
async function remindLead(auto: Table, row: SheetRow): Promise<number> {
  const sentCsv = cell(auto, row, A.remindersSent);
  const due = dueReminders(sentCsv);
  if (!due.length) return 0;

  const l = leadFromAuto(auto, row);
  const token = cell(auto, row, A.token);
  const ctx = ctxFor(l, token);
  const already = new Set(
    sentCsv.split(",").map((s) => s.trim()).filter(Boolean),
  );
  const justSent: string[] = [];
  const failed: string[] = [];

  for (const r of due) {
    try {
      if (r.kind === "email") {
        if (!l.email) continue;
        const kind = r.key === "EM6" ? "EM6" : r.key === "EM7" ? "EM7" : "EM8";
        const { subject, html } = emailFor(kind, ctx);
        const attachments = l.regId
          ? [
              {
                name: `Event_Pass_${firstNameOf(l.name)}.pdf`,
                contentBytes: await generatePassBase64({
                  name: l.name || "Guest",
                  company: l.company,
                  regId: l.regId,
                }),
                contentType: "application/pdf",
              },
            ]
          : undefined;
        await sendMail({ to: l.email, subject, html, attachments });
      } else {
        if (!l.phone) continue;
        const tpl =
          r.key === "WA6"
            ? WA_TEMPLATES.WA6
            : r.key === "WA7"
              ? WA_TEMPLATES.WA7
              : WA_TEMPLATES.WA8;
        await sendTemplate({
          whatsappNumber: l.phone,
          templateName: tpl,
          parameters: waParamsFor(tpl, ctx),
        });
      }
      already.add(r.key);
      justSent.push(r.key);
    } catch (e) {
      failed.push(r.key);
      console.error(`[remind] ${r.key} failed for ${l.leadId}:`, e);
    }
  }

  if (justSent.length) {
    await updateRow(auto, row.rowNumber, {
      [A.remindersSent]: Array.from(already).join(","),
    });
  }
  if (justSent.length || failed.length) {
    await notifySlack(
      `:alarm_clock: *Reminder* — ${l.name || "Guest"}` +
        (justSent.length ? ` · sent ${justSent.join(" + ")}` : "") +
        (failed.length ? ` · :warning: failed ${failed.join(", ")}` : ""),
    );
  }
  return justSent.length;
}

export interface TickSummary {
  ingested: number;
  nurtured: number;
  remindersSent: number;
  formRows: number;
  automationRows: number;
  errors: string[];
}

// The hourly tick — the whole scheduled engine.
export async function runTick(): Promise<TickSummary> {
  const [form, auto] = await Promise.all([
    readTable(env.formTab()),
    readTable(env.autoTab()),
  ]);

  const summary: TickSummary = {
    ingested: 0,
    nurtured: 0,
    remindersSent: 0,
    formRows: form.rows.length,
    automationRows: auto.rows.length,
    errors: [],
  };

  // Resolve the form's column names (they differ from ours, e.g. "your_name:").
  const cId = resolveHeader(form, FORM.id);
  const cName = resolveHeader(form, FORM.name);
  const cEmail = resolveHeader(form, FORM.email);
  const cPhone = resolveHeader(form, FORM.phone);
  const cCompany = resolveHeader(form, FORM.company);

  const known = new Set(
    auto.rows.map((r) => cell(auto, r, A.leadId)).filter(Boolean),
  );

  // 1) INGEST — form rows we haven't seen before.
  for (const fr of form.rows) {
    const leadId = cId ? cell(form, fr, cId) : "";
    if (!leadId || known.has(leadId)) continue;
    const l: LeadData = {
      leadId,
      name: cName ? cell(form, fr, cName) : "",
      email: cEmail ? cell(form, fr, cEmail) : "",
      phone: cPhone ? cell(form, fr, cPhone) : "",
      company: cCompany ? cell(form, fr, cCompany) : "",
    };
    if (!l.email && !l.phone) continue;
    if (isTestLead(l)) continue;
    try {
      await ingestLead(auto, l, "meta_form");
      known.add(leadId);
      summary.ingested++;
    } catch (e) {
      const msg = `ingest ${leadId}: ${(e as Error).message}`;
      summary.errors.push(msg);
      console.error("[tick]", msg);
    }
  }

  // 2) NURTURE + REMINDERS — on existing automation rows.
  const quiet = isQuietHours();
  for (const ar of auto.rows) {
    if (!cell(auto, ar, A.token)) continue; // not an active lead row
    try {
      if (isDone(cell(auto, ar, A.done))) {
        summary.remindersSent += await remindLead(auto, ar);
      } else if (!quiet && dueForNurture(cell(auto, ar, A.lastNudge))) {
        await nurtureLead(auto, ar);
        summary.nurtured++;
      }
    } catch (e) {
      const msg = `row ${ar.rowNumber}: ${(e as Error).message}`;
      summary.errors.push(msg);
      console.error("[tick]", msg);
    }
  }

  if (summary.errors.length) {
    await notifySlack(
      `:rotating_light: Tick finished with *${summary.errors.length} error(s)* — ${summary.errors[0]}`,
    );
  }
  return summary;
}

// ---- Confirm entry points (called by /api/confirm) ----

export async function confirmByToken(
  token: string,
): Promise<{ ok: boolean; already?: boolean; name?: string; regId?: string; error?: string }> {
  const auto = await readTable(env.autoTab());
  const row = auto.rows.find((r) => cell(auto, r, A.token) === token);
  if (!row) return { ok: false, error: "not_found" };
  if (isDone(cell(auto, row, A.done))) {
    return {
      ok: true,
      already: true,
      name: cell(auto, row, A.name),
      regId: cell(auto, row, A.regId),
    };
  }
  const { regId, name } = await confirmRow(auto, row);
  return { ok: true, name, regId };
}

export async function confirmOrganic(input: {
  name: string;
  email: string;
  phone: string;
  company?: string;
}): Promise<{ ok: boolean; name: string; regId?: string; error?: string }> {
  const auto = await readTable(env.autoTab());
  const digits = (s: string) => s.replace(/\D/g, "");

  // De-dupe: same email or phone already tracked → confirm that row.
  const existing = auto.rows.find(
    (r) =>
      (input.email &&
        cell(auto, r, A.email).toLowerCase() === input.email.toLowerCase()) ||
      (input.phone && digits(cell(auto, r, A.phone)) === digits(input.phone)),
  );
  if (existing) {
    if (isDone(cell(auto, existing, A.done))) {
      return {
        ok: true,
        name: cell(auto, existing, A.name),
        regId: cell(auto, existing, A.regId),
      };
    }
    const { regId, name } = await confirmRow(auto, existing);
    return { ok: true, name, regId };
  }

  const token = genToken();
  await appendRow(auto, {
    [A.leadId]: `organic-${token.slice(0, 10)}`,
    [A.name]: input.name,
    [A.email]: input.email,
    [A.phone]: input.phone,
    [A.company]: input.company ?? "",
    [A.token]: token,
    [A.nurtureStage]: "0",
    [A.lastNudge]: nowIso(),
    [A.source]: "organic",
  });

  const auto2 = await readTable(env.autoTab());
  const row = auto2.rows.find((r) => cell(auto2, r, A.token) === token);
  if (!row) return { ok: false, name: input.name, error: "append_failed" };
  const { regId, name } = await confirmRow(auto2, row);
  return { ok: true, name, regId };
}

// Regenerate the pass PDF for a token (powers GET /api/pass).
export async function passPdfForToken(
  token: string,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const auto = await readTable(env.autoTab());
  const row = auto.rows.find((r) => cell(auto, r, A.token) === token);
  if (!row) return null;
  const regId = cell(auto, row, A.regId);
  if (!regId) return null; // pass not issued until confirmed
  const name = cell(auto, row, A.name) || "Guest";
  const company = cell(auto, row, A.company);
  const bytes = await generatePass({ name, company, regId });
  return { bytes, filename: `Event_Pass_${firstNameOf(name)}.pdf` };
}
