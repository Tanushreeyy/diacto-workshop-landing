// Orchestration: the booking workflow.
//
//   Meta Instant Form (name + phone + email + location) → form tab (connector-owned, READ ONLY)
//        │  tick ingests → automation row + token → WA-1 + EM-1 (registration link)
//        │  The form is deliberately light; the rest (designation, company, employee
//        │  count, expectations) is collected on the landing page at registration.
//        │
//        ├─ taps our link      → landing ?rid=token → PREFILLED, asks only what's missing
//        ├─ taps Meta's button → landing, enters phone → matched → asks only what's missing
//        └─ never finishes     → WA-2/3/4 + EM-2/3/4 nurture, 10:00 & 17:00 IST
//
//   Registration (landing form) → WA-5 + EM-5 with the Event Pass → Slack
//   Reminders                   → day before / morning of / 2h before
//
// All state lives in the `automation` tab; every operation is idempotent.

import crypto from "crypto";
import { env } from "./env";
import {
  WORKSHOP,
  WA_TEMPLATES,
  WA_NURTURE_LADDER,
  OPT_OUT,
  OptOutReason,
  isChannelDead,
} from "./config";
import {
  readSwitches,
  readHeaderBaseline,
  writeHeaderBaseline,
} from "./control";
import {
  checkAutomationTable,
  headerFingerprint,
  detectHeaderDrift,
  MAX_INGEST_PER_TICK,
  MAX_NURTURE_PER_TICK,
} from "./preflight";
import { withSheetLock } from "./lock";
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
import { phoneKey, toE164, isValidPhone, phoneProblem } from "./phone";
import { samePerson } from "./names";

// ---- automation tab (ours) ----
const A = {
  leadId: "lead_id",
  source: "source",
  createdAt: "created_at",
  name: "name",
  designation: "designation",
  company: "company",
  location: "location",
  employeeCount: "employee_count",
  phone: "phone",
  phoneKey: "phone_key",
  email: "email",
  regId: "reg_id",
  token: "confirm_token",
  done: "registration_complete",
  registeredAt: "registered_at",
  nurtureStage: "nurture_stage",
  lastNudge: "last_nudge_at",
  passSent: "pass_sent_at",
  remindersSent: "reminders_sent",
  expectations: "expectations",
  // INTENT. Any value here stops every channel, reminders included. Blank =
  // subscribed, so clearing the cell in the sheet resubscribes them.
  optedOut: "opted_out",
  optedOutAt: "opted_out_at",
  // CHANNEL HEALTH — can we physically reach them this way? Independent of
  // intent and of each other: a dead mailbox mutes email while WhatsApp carries
  // on, and vice versa. Filled in by hand (or by the bounce sweep) and cleared
  // by hand when someone supplies a working address or number.
  emailDead: "email_dead",
  emailDeadAt: "email_dead_at",
  waDead: "wa_dead",
  waDeadAt: "wa_dead_at",
} as const;

// Columns T/U/V of the automation tab (Status / Sub Status / Remarks) belong to
// the calling team, not to us. They are absent from this map on purpose:
// updateRow() only ever writes keys it finds here, so we can never clobber them.

// ---- form tabs (Meta's) — resolved by candidate names ----
// Header matching ignores case and punctuation (see resolveHeader), so one
// candidate covers "Company Name", "company_name" and "company_name:" alike.
export const FORM = {
  id: ["id"],
  name: ["full_name", "your_name", "your_full_name", "name"],
  email: ["email", "email_address"],
  // Meta names the column after the question, so this varies per form: the v2 tab
  // calls it "phone", the v3 tab calls it "whatsapp_number". Miss it and the lead
  // ingests with no phone at all — no WhatsApp, no phone_key to dedupe on, and the
  // landing page's phone lookup can never find them.
  phone: ["phone", "phone_number", "whatsapp_number", "whatsapp", "mobile_number", "mobile"],
  // Added by the v3 form (Snehal's qualifying questions). Absent from the older
  // form's tab — resolveHeader returns null there and ingest just leaves them blank.
  designation: ["designation", "your_designation", "what_is_your_designation"],
  company: ["company_name", "company", "organization_name", "organisation_name"],
  employeeCount: [
    "no_of_employees",
    "number_of_employees",
    "employee_count",
    "employees",
    "company_size",
  ],
  // The new Instant Form (Campaign2 tab) phrases it "where_are_you_based?"; the older
  // forms used "organization_location". The landing page prefills + hides it either way.
  location: [
    "organization_location",
    "organisation_location",
    "where_are_you_based",
    "location",
    "city",
  ],
};

const isDone = (v: string) => (v || "").trim().toUpperCase() === "TRUE";

export interface Prefill {
  name: string;
  email: string;
  phone: string;
  designation: string;
  company: string;
  location: string;
  employeeCount: string;
  expectations: string;
}

export interface LookupResult {
  found: boolean;
  alreadyRegistered: boolean;
  regId?: string;
  passUrl?: string;
  prefill?: Prefill;
}

export interface RegistrationInput extends Prefill {
  rid?: string;
}

function firstNameOf(fullName: string): string {
  const n = (fullName || "").trim().split(/\s+/)[0];
  return n && !n.startsWith("<") ? n : "there";
}

const genToken = () => crypto.randomBytes(18).toString("base64url");
const genRegId = () =>
  `${WORKSHOP.regIdPrefix}-${WORKSHOP.eventMMDD}-${crypto
    .randomInt(0, 10000)
    .toString()
    .padStart(4, "0")}`;

export const registrationLink = (token: string) =>
  `${env.landingBaseUrl()}/?rid=${encodeURIComponent(token)}`;
const passUrl = (token: string) =>
  `${env.landingBaseUrl()}/api/pass?rid=${encodeURIComponent(token)}`;

// "failed WA-1" tells you nothing you can act on. The thrown error already carries
// the provider's status and response body (see wati.ts / graph.ts) — keep it, on one
// line, so the Slack alert says whether it was credits, auth, or a paused template.
function failure(label: string, e: unknown): string {
  const why = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").trim();
  return why ? `${label} — ${why.slice(0, 180)}` : label;
}

export const unsubscribeLink = (token: string) =>
  `${env.landingBaseUrl()}/api/unsubscribe?rid=${encodeURIComponent(token)}`;

function ctxFor(name: string, token: string, regId?: string): MsgCtx {
  return {
    firstName: firstNameOf(name),
    bookingLink: registrationLink(token),
    passUrl: passUrl(token),
    unsubscribeUrl: unsubscribeLink(token),
    regId,
    dateLabel: WORKSHOP.dateLabel,
    dateShort: WORKSHOP.dateShort,
    timeLabel: WORKSHOP.timeLabel,
    venue: WORKSHOP.venue,
    mapUrl: WORKSHOP.mapUrl,
    support: WORKSHOP.supportNumber,
  };
}

function isTestLead(name: string, email: string, phone: string): boolean {
  return (
    email.toLowerCase() === "test@meta.com" ||
    name.includes("<test") ||
    phone.includes("<test")
  );
}

function rowToPrefill(auto: Table, row: SheetRow): Prefill {
  return {
    name: cell(auto, row, A.name),
    email: cell(auto, row, A.email),
    phone: cell(auto, row, A.phone),
    designation: cell(auto, row, A.designation),
    company: cell(auto, row, A.company),
    location: cell(auto, row, A.location),
    employeeCount: cell(auto, row, A.employeeCount),
    expectations: cell(auto, row, A.expectations),
  };
}

// ─────────────────────────── LOOKUP (prefill) ───────────────────────────

/**
 * Powers the landing page. Either:
 *   • rid   — they arrived via our WhatsApp/email link → identified outright
 *   • phone — they arrived via Meta's thank-you button → matched on last 10 digits
 * Returns only what we need to prefill; never echoes another person's details
 * back unless the identifier they supplied actually matches them.
 */
export async function lookupLead(q: {
  rid?: string;
  phone?: string;
}): Promise<LookupResult> {
  const auto = await readTable(env.autoTab());
  let row: SheetRow | undefined;

  if (q.rid) {
    row = auto.rows.find((r) => cell(auto, r, A.token) === q.rid);
  } else if (q.phone && isValidPhone(q.phone)) {
    const key = phoneKey(q.phone);
    row = auto.rows.find((r) => cell(auto, r, A.phoneKey) === key);
  }

  if (!row) return { found: false, alreadyRegistered: false };

  const token = cell(auto, row, A.token);
  if (isDone(cell(auto, row, A.done))) {
    return {
      found: true,
      alreadyRegistered: true,
      regId: cell(auto, row, A.regId),
      passUrl: passUrl(token),
      prefill: rowToPrefill(auto, row),
    };
  }
  return { found: true, alreadyRegistered: false, prefill: rowToPrefill(auto, row) };
}

// ─────────────────────────── REGISTER ───────────────────────────

async function sendConfirmation(
  l: Prefill,
  regId: string,
  token: string,
): Promise<{ sent: string[]; failed: string[] }> {
  const ctx = ctxFor(l.name, token, regId);
  const sent: string[] = [];
  const failed: string[] = [];

  if (l.phone) {
    try {
      await sendTemplate({
        whatsappNumber: l.phone,
        templateName: WA_TEMPLATES.WA5,
        parameters: waParamsFor(WA_TEMPLATES.WA5, ctx),
      });
      sent.push("WA-5");
    } catch (e) {
      failed.push(failure("WA-5", e));
      console.error(`[register] WA-5 failed for ${regId}:`, e);
    }
  }
  if (l.email) {
    try {
      const pass = await generatePassBase64({
        name: l.name,
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
      failed.push(failure("EM-5", e));
      console.error(`[register] EM-5 failed for ${regId}:`, e);
    }
  }
  return { sent, failed };
}

/** The landing-form submit. Updates the existing lead row, or creates one. */
export interface RegisterResult {
  ok: boolean;
  already?: boolean;
  name?: string;
  regId?: string;
  passUrl?: string;
  error?: string;
}

// Registration is read-find-write against the automation tab, so it MUST run
// under the sheet lock or it races the tick's ingest: the two landed 161ms apart
// once and produced two rows for one person. The lock serialises them within our
// single app process (see lock.ts).
export async function registerLead(input: RegistrationInput): Promise<RegisterResult> {
  return withSheetLock("registerLead", () => registerLeadLocked(input));
}

async function registerLeadLocked(input: RegistrationInput): Promise<RegisterResult> {
  const auto = await readTable(env.autoTab());
  const e164 = toE164(input.phone);
  const key = phoneKey(input.phone);

  // Find them: by token, then phone, then email.
  let row =
    (input.rid
      ? auto.rows.find((r) => cell(auto, r, A.token) === input.rid)
      : undefined) ??
    auto.rows.find((r) => cell(auto, r, A.phoneKey) === key) ??
    (input.email
      ? auto.rows.find(
          (r) =>
            cell(auto, r, A.email).toLowerCase() === input.email.toLowerCase(),
        )
      : undefined);

  if (row && isDone(cell(auto, row, A.done))) {
    const token = cell(auto, row, A.token);
    return {
      ok: true,
      already: true,
      name: cell(auto, row, A.name),
      regId: cell(auto, row, A.regId),
      passUrl: passUrl(token),
    };
  }

  const regId = genRegId();
  const token = row ? cell(auto, row, A.token) || genToken() : genToken();

  // The user's typed values win over whatever Meta had (profile emails go stale).
  const fields: Record<string, string> = {
    [A.name]: input.name,
    [A.phone]: e164,
    [A.phoneKey]: key,
    [A.email]: input.email,
    [A.expectations]: input.expectations,
    [A.regId]: regId,
    [A.token]: token,
    [A.done]: "TRUE",
    [A.registeredAt]: nowIso(),
    [A.passSent]: nowIso(),
  };

  // The qualifying answers now come from the Meta form, so the landing page only
  // asks for the ones we're still missing — which means an empty value here means
  // "not asked", NOT "cleared". Writing it back would wipe what Meta gave us (and
  // blank the company line on the Event Pass). Only overwrite when they typed something.
  for (const [col, typed] of [
    [A.designation, input.designation],
    [A.company, input.company],
    [A.location, input.location],
    [A.employeeCount, input.employeeCount],
  ] as const) {
    if (typed) fields[col] = typed;
  }

  if (row) {
    await updateRow(auto, row.rowNumber, fields); // known lead completes registration
  } else {
    await appendRow(auto, {
      ...fields,
      [A.leadId]: `direct-${token.slice(0, 10)}`,
      [A.source]: "landing_direct",
      [A.createdAt]: nowIso(),
      [A.nurtureStage]: "0",
    });
  }

  // What the lead actually IS, not just what they retyped: the hidden fields are
  // absent from `input`, and the Event Pass prints the company. Row first, typed on top.
  const was = row
    ? rowToPrefill(auto, row)
    : { name: "", email: "", phone: "", designation: "", company: "", location: "", employeeCount: "", expectations: "" };
  const pick = (typed: string, had: string) => typed || had;
  const lead: Prefill = {
    name: pick(input.name, was.name),
    email: pick(input.email, was.email),
    phone: e164,
    designation: pick(input.designation, was.designation),
    company: pick(input.company, was.company),
    location: pick(input.location, was.location),
    employeeCount: pick(input.employeeCount, was.employeeCount),
    expectations: pick(input.expectations, was.expectations),
  };

  const { sent, failed } = await sendConfirmation(lead, regId, token);

  await notifySlack(
    `:tada: *New registration* — ${lead.name}` +
      (lead.designation ? `, ${lead.designation}` : "") +
      (lead.company ? ` @ ${lead.company}` : "") +
      `\n• Reg ID: *${regId}*` +
      `\n• ${e164} · ${lead.email}` +
      (lead.employeeCount ? `\n• ${lead.employeeCount} employees` : "") +
      (lead.expectations ? `\n• _Expectations:_ ${lead.expectations}` : "") +
      (sent.length ? `\n• Sent: ${sent.join(" + ")}` : "") +
      (failed.length ? `\n• :warning: Failed: ${failed.join(", ")}` : ""),
  );

  return { ok: true, name: lead.name, regId, passUrl: passUrl(token) };
}

// ─────────────────────────── TICK: ingest · nurture · remind ───────────────────────────

interface FormLead {
  leadId: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  company: string;
  employeeCount: string;
  location: string;
}

async function ingestLead(auto: Table, l: FormLead): Promise<void> {
  const token = genToken();
  const e164 = toE164(l.phone);
  const key = phoneKey(l.phone);
  const waProblem = e164 ? phoneProblem(e164) : "no number";

  // The append runs under the lock AND re-checks dedupe against a fresh read
  // inside it. The tick's outer knownIds/knownPhones sets are built from one
  // snapshot at the top of the run; a registration completing mid-tick (or the
  // person submitting both forms in the same tick) would slip past them. Re-read
  // here, and if the lead already exists, skip the append AND the send. Returns
  // false when it skipped, so the caller doesn't send WA-1/EM-1.
  const didAppend = await withSheetLock("ingestLead.append", async () => {
    const fresh = await readTable(env.autoTab());
    const seen =
      (l.leadId && fresh.rows.some((r) => cell(fresh, r, A.leadId) === l.leadId)) ||
      (key && fresh.rows.some((r) => cell(fresh, r, A.phoneKey) === key));
    if (seen) return false;
    await appendRow(fresh, {
      [A.leadId]: l.leadId,
      [A.source]: "meta_form",
      [A.createdAt]: nowIso(),
      [A.name]: l.name,
      // Present only on the v3 form; blank from the older one, and then asked for
      // on the landing page instead.
      [A.designation]: l.designation,
      [A.company]: l.company,
      [A.employeeCount]: l.employeeCount,
      [A.location]: l.location,
      [A.phone]: e164,
      [A.phoneKey]: key,
      [A.email]: l.email,
      [A.token]: token,
      [A.nurtureStage]: "0",
      [A.waDead]: waProblem ?? "",
      [A.waDeadAt]: waProblem ? nowIso() : "",
      [A.lastNudge]: nowIso(),
    });
    return true;
  });
  if (!didAppend) return; // already present — nothing sent

  const ctx = ctxFor(l.name, token);
  const sent: string[] = [];
  const failed: string[] = [];

  // Validate before the first send rather than discovering it on every tick for
  // the next ten days. A typo'd number is caught the moment the lead arrives.
  if (waProblem) {
    console.warn(`[ingest] ${l.leadId}: unreachable number ${e164} — ${waProblem}`);
  }
  if (e164 && !waProblem) {
    try {
      await sendTemplate({
        whatsappNumber: e164,
        templateName: WA_TEMPLATES.WA1,
        parameters: waParamsFor(WA_TEMPLATES.WA1, ctx),
      });
      sent.push("WA-1");
    } catch (e) {
      failed.push(failure("WA-1", e));
      console.error(`[ingest] WA-1 failed for ${l.leadId}:`, e);
    }
  }
  if (l.email) {
    try {
      const { subject, html } = emailFor("EM1", ctx);
      await sendMail({ to: l.email, subject, html });
      sent.push("EM-1");
    } catch (e) {
      failed.push(failure("EM-1", e));
      console.error(`[ingest] EM-1 failed for ${l.leadId}:`, e);
    }
  }

  await notifySlack(
    `:inbox_tray: *New lead* (Meta form) — ${l.name || "Unknown"}` +
      (sent.length ? ` · sent ${sent.join(" + ")}` : "") +
      (failed.length ? ` · :warning: failed ${failed.join(", ")}` : ""),
  );
}

// A lead's address/number, or "" when that channel is marked dead. Every send
// site already skips a falsy value, so returning "" is all it takes to mute one
// channel and leave the other running.
export function emailUsable(auto: Table, row: SheetRow): string {
  if (isChannelDead(cell(auto, row, A.emailDead))) return "";
  return cell(auto, row, A.email);
}

export function phoneUsable(auto: Table, row: SheetRow): string {
  if (isChannelDead(cell(auto, row, A.waDead))) return "";
  const phone = cell(auto, row, A.phone);
  // Enforced here as well as in the column, so a number that cannot possibly
  // receive a message is never tried even if nobody has marked it by hand.
  if (phone && phoneProblem(phone)) return "";
  return phone;
}

async function nurtureLead(auto: Table, row: SheetRow): Promise<void> {
  const name = cell(auto, row, A.name);
  const phone = phoneUsable(auto, row);
  const email = emailUsable(auto, row);
  const token = cell(auto, row, A.token);
  const ctx = ctxFor(name, token);
  const stage = parseInt(cell(auto, row, A.nurtureStage) || "0", 10) || 0;
  const tpl = WA_NURTURE_LADDER[Math.min(stage, WA_NURTURE_LADDER.length - 1)];
  const emailKind = stage === 0 ? "EM2" : stage === 1 ? "EM3" : "EM4";

  const sent: string[] = [];
  const failed: string[] = [];

  if (phone) {
    try {
      await sendTemplate({
        whatsappNumber: phone,
        templateName: tpl,
        parameters: waParamsFor(tpl, ctx),
      });
      sent.push(tpl);
    } catch (e) {
      failed.push(failure(tpl, e));
      console.error(`[nurture] WA failed:`, e);
    }
  }
  if (email) {
    try {
      const { subject, html } = emailFor(emailKind, ctx);
      await sendMail({ to: email, subject, html });
      sent.push(emailKind);
    } catch (e) {
      failed.push(failure(emailKind, e));
      console.error(`[nurture] email failed:`, e);
    }
  }

  await updateRow(auto, row.rowNumber, {
    [A.nurtureStage]: String(stage + 1),
    [A.lastNudge]: nowIso(),
  });

  await notifySlack(
    `:bell: *Nudge* (touch ${stage + 1}) — ${name || "Unknown"}` +
      (sent.length ? ` · sent ${sent.join(" + ")}` : "") +
      (failed.length ? ` · :warning: failed ${failed.join(", ")}` : ""),
  );
}

async function remindLead(auto: Table, row: SheetRow): Promise<number> {
  const sentCsv = cell(auto, row, A.remindersSent);
  const due = dueReminders(sentCsv);
  if (!due.length) return 0;

  const name = cell(auto, row, A.name) || "Guest";
  const company = cell(auto, row, A.company);
  const email = emailUsable(auto, row);
  const phone = phoneUsable(auto, row);
  const regId = cell(auto, row, A.regId);
  const token = cell(auto, row, A.token);
  const ctx = ctxFor(name, token, regId || undefined);

  const already = new Set(sentCsv.split(",").map((s) => s.trim()).filter(Boolean));
  const justSent: string[] = [];
  const failed: string[] = [];

  for (const r of due) {
    try {
      if (r.kind === "email") {
        if (!email) continue;
        const kind = r.key === "EM6" ? "EM6" : r.key === "EM7" ? "EM7" : "EM8";
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
        await sendMail({ to: email, subject, html, attachments });
      } else {
        if (!phone) continue;
        const tpl =
          r.key === "WA6"
            ? WA_TEMPLATES.WA6
            : r.key === "WA7"
              ? WA_TEMPLATES.WA7
              : WA_TEMPLATES.WA8;
        await sendTemplate({
          whatsappNumber: phone,
          templateName: tpl,
          parameters: waParamsFor(tpl, ctx),
        });
      }
      already.add(r.key);
      justSent.push(r.key);
    } catch (e) {
      failed.push(failure(r.key, e));
      console.error(`[remind] ${r.key} failed:`, e);
    }
  }

  if (justSent.length) {
    await updateRow(auto, row.rowNumber, {
      [A.remindersSent]: Array.from(already).join(","),
    });
  }
  if (justSent.length || failed.length) {
    await notifySlack(
      `:alarm_clock: *Reminder* — ${name}` +
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
  suppressed: number; // rows skipped because they opted out
  unreachable: number; // rows with no working channel left (email + WhatsApp both dead)
  formRows: number;
  leads: number;
  switches: string; // which switches were in effect this tick
  halted: boolean; // preflight refused to run — the sheet looks damaged
  capped: string[]; // limits that bit this tick (blast-radius ceilings)
  truncated: boolean; // hit the time budget — the next tick picks up the rest
  errors: string[];
}

export async function runTick(): Promise<TickSummary> {
  // Deadline-bounded. Every unit of work is independently persisted, so stopping
  // early is always safe: the next tick simply resumes. This is what keeps us
  // inside a serverless function timeout no matter how many leads are queued.
  const startedAt = Date.now();
  const budgetMs = env.tickBudgetMs();
  const outOfTime = () => Date.now() - startedAt > budgetMs;

  // One tab per live Instant Form. A tab that doesn't exist yet (the next form's
  // connection hasn't run) resolves to null and is simply skipped.
  const tabs = env.formTabs();
  const [forms, auto, switches] = await Promise.all([
    Promise.all(tabs.map((t) => readTable(t).catch(() => null))),
    readTable(env.autoTab()),
    readSwitches(),
  ]);

  const summary: TickSummary = {
    ingested: 0,
    nurtured: 0,
    remindersSent: 0,
    suppressed: 0,
    unreachable: 0,
    formRows: forms.reduce((n, f) => n + (f?.rows.length ?? 0), 0),
    leads: auto.rows.length,
    switches: `ingest=${switches.ingest} nurture=${switches.nurture} reminders=${switches.reminders} [${switches.source}]`,
    halted: false,
    capped: [],
    truncated: false,
    errors: [],
  };

  // 0) PREFLIGHT — is the automation tab still the automation tab?
  //
  // Runs before anything is read for sending. A damaged header means dedupe and
  // suppression are both blind, and a blind tick doesn't send nothing — it sends
  // everything, to everyone, every five minutes. Bail out and shout.
  const pre = checkAutomationTable(auto);
  if (!pre.ok) {
    summary.errors.push(...pre.problems.map((p) => `preflight: ${p}`));
    summary.halted = true;
    await notifySlack(
      `:octagonal_sign: *TICK HALTED — the automation tab looks damaged.* Nothing was sent.\n` +
        pre.problems.map((p) => `• ${p}`).join("\n") +
        `\n\nMost likely someone edited or sorted the sheet by hand. Fix the header row and the next tick resumes on its own. ` +
        `This is the guard that was missing on 17 July, when a blanked header sent 813 emails to 29 people in three hours.`,
    );
    return summary;
  }

  // Any hand-edit of the header, however harmless, gets reported once. The tick
  // continues — this is a notification, not a gate; the fatal cases were caught
  // above. Failure to read or record the baseline must never stop a tick.
  try {
    const fingerprint = headerFingerprint(auto);
    const baseline = await readHeaderBaseline();
    if (baseline === null) {
      await writeHeaderBaseline(fingerprint); // first run — record what we found
    } else if (baseline !== fingerprint) {
      const drift = detectHeaderDrift(auto, baseline);
      await notifySlack(
        `:eyes: *The automation tab's header changed.* ${drift.summary}\n` +
          `Sending continues — the required columns are all still present and readable. ` +
          `If this wasn't deliberate, check the sheet: an accidental sort is what broke it on 17 July.`,
      );
      await writeHeaderBaseline(fingerprint); // report once, not every tick
    }
  } catch (e) {
    summary.errors.push(`header baseline: ${(e as Error).message}`);
  }

  // 1) INGEST — form rows we haven't seen (matched on lead id, then phone).
  // Dedupe sets are built once from the automation tab and shared across every
  // form tab, so the same person submitting both forms is ingested exactly once.
  const knownIds = new Set(auto.rows.map((r) => cell(auto, r, A.leadId)).filter(Boolean));
  const knownPhones = new Set(auto.rows.map((r) => cell(auto, r, A.phoneKey)).filter(Boolean));

  for (const form of forms) {
    if (!switches.ingest) break; // ingest paused via the control tab
    if (!form) continue;
    if (outOfTime()) { summary.truncated = true; break; }

    const cId = resolveHeader(form, FORM.id);
    const cName = resolveHeader(form, FORM.name);
    const cEmail = resolveHeader(form, FORM.email);
    const cPhone = resolveHeader(form, FORM.phone);
    const cDesig = resolveHeader(form, FORM.designation);
    const cCompany = resolveHeader(form, FORM.company);
    const cEmp = resolveHeader(form, FORM.employeeCount);
    const cLoc = resolveHeader(form, FORM.location);
    const get = (fr: SheetRow, col: string | null) => (col ? cell(form, fr, col) : "");

    for (const fr of form.rows) {
      if (outOfTime()) { summary.truncated = true; break; }
      const leadId = get(fr, cId);
      const name = get(fr, cName);
      const email = get(fr, cEmail);
      const phone = get(fr, cPhone);
      if (!leadId || (!email && !phone)) continue;
      if (knownIds.has(leadId) || (phone && knownPhones.has(phoneKey(phone)))) continue;
      if (isTestLead(name, email, phone)) continue;
      // Blast-radius ceiling. Real traffic is a few new leads per tick; a flood
      // of "new" leads means dedupe has stopped working, which is precisely how
      // the July incident looked from the inside.
      if (summary.ingested >= MAX_INGEST_PER_TICK) {
        if (!summary.capped.includes("ingest")) {
          summary.capped.push("ingest");
          await notifySlack(
            `:warning: *Ingest ceiling hit* — ${MAX_INGEST_PER_TICK} new leads in one tick. ` +
              `The rest wait for the next tick. If this repeats, dedupe is not working and the sheet needs a look.`,
          );
        }
        summary.truncated = true;
        break;
      }
      try {
        await ingestLead(auto, {
          leadId,
          name,
          email,
          phone,
          designation: get(fr, cDesig),
          company: get(fr, cCompany),
          employeeCount: get(fr, cEmp),
          location: get(fr, cLoc),
        });
        knownIds.add(leadId);
        if (phone) knownPhones.add(phoneKey(phone));
        summary.ingested++;
      } catch (e) {
        summary.errors.push(`ingest ${leadId}: ${(e as Error).message}`);
      }
    }
  }

  // 1b) RECONCILE — retire rows that raced into existence as duplicates of the
  // same phone number. Cheap backstop; the gate below then skips them this tick.
  // Failure here must never sink the whole tick, so it's caught and logged only.
  try {
    const rec = await reconcileDuplicates();
    if (rec.retired) {
      await notifySlack(
        `:broom: Reconcile retired *${rec.retired}* duplicate row(s) across ${rec.groups} phone group(s).`,
      );
    }
  } catch (e) {
    summary.errors.push(`reconcile: ${(e as Error).message}`);
  }

  // 2) NURTURE (not yet registered) + REMINDERS (registered).
  const quiet = isQuietHours();
  for (const row of auto.rows) {
    if (outOfTime()) { summary.truncated = true; break; }
    if (!cell(auto, row, A.token)) continue;

    // Opt-out gate — one place, every channel. ANY value in opted_out silences
    // everything, reminders included: once someone has replied, unsubscribed or
    // been retired as a duplicate we stop messaging them, full stop. Sits BEFORE
    // the isDone branch so it governs reminders too.
    const optOut = cell(auto, row, A.optedOut).trim();
    const registered = isDone(cell(auto, row, A.done));
    if (optOut) {
      summary.suppressed++;
      continue;
    }

    // Channel health is a separate question from intent: this person has not
    // asked us to stop, we simply have no working address or number left. Skip
    // rather than walk into nurtureLead and do nothing.
    if (!emailUsable(auto, row) && !phoneUsable(auto, row)) {
      summary.unreachable++;
      continue;
    }

    try {
      if (registered) {
        if (switches.reminders) summary.remindersSent += await remindLead(auto, row);
      } else if (switches.nurture && !quiet && dueForNurture(cell(auto, row, A.lastNudge))) {
        if (summary.nurtured >= MAX_NURTURE_PER_TICK) {
          if (!summary.capped.includes("nurture")) {
            summary.capped.push("nurture");
            await notifySlack(
              `:warning: *Nurture ceiling hit* — ${MAX_NURTURE_PER_TICK} follow-ups in one tick. ` +
                `The rest wait for the next tick.`,
            );
          }
          summary.truncated = true;
          break;
        }
        await nurtureLead(auto, row);
        summary.nurtured++;
      }
    } catch (e) {
      summary.errors.push(`row ${row.rowNumber}: ${(e as Error).message}`);
    }
  }

  if (summary.errors.length) {
    await notifySlack(
      `:rotating_light: Tick had *${summary.errors.length} error(s)* — ${summary.errors[0]}`,
    );
  }
  return summary;
}

export async function passPdfForToken(
  token: string,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const auto = await readTable(env.autoTab());
  const row = auto.rows.find((r) => cell(auto, r, A.token) === token);
  if (!row) return null;
  const regId = cell(auto, row, A.regId);
  if (!regId) return null;
  const name = cell(auto, row, A.name) || "Guest";
  const company = cell(auto, row, A.company);
  const bytes = await generatePass({ name, company, regId });
  return { bytes, filename: `Event_Pass_${firstNameOf(name)}.pdf` };
}

export interface OptOutResult {
  ok: boolean;
  found: boolean;
  name?: string;
  reason?: OptOutReason;
  alreadyOut?: boolean;
}

// Set (or clear) a lead's opt-out. Locked because it is a read-modify-write on the
// same tab the tick and registration touch. Idempotent: opting out an already-out
// lead is a no-op that still reports success.
export async function setOptOut(
  match: { token?: string; phoneKey?: string },
  reason: OptOutReason,
): Promise<OptOutResult> {
  return withSheetLock("setOptOut", async () => {
    const auto = await readTable(env.autoTab());
    const row =
      (match.token ? auto.rows.find((r) => cell(auto, r, A.token) === match.token) : undefined) ??
      (match.phoneKey
        ? auto.rows.find((r) => cell(auto, r, A.phoneKey) === match.phoneKey)
        : undefined);
    if (!row) return { ok: true, found: false };

    const name = cell(auto, row, A.name) || "there";
    const current = cell(auto, row, A.optedOut).trim().toLowerCase();
    // Never downgrade a hard unsubscribe to a soft reply: someone who opted out
    // fully and then sends another message must stay fully out.
    if (current === OPT_OUT.unsubscribe && reason === OPT_OUT.reply) {
      return { ok: true, found: true, name, reason: OPT_OUT.unsubscribe, alreadyOut: true };
    }
    if (current === reason) return { ok: true, found: true, name, reason, alreadyOut: true };

    await updateRow(auto, row.rowNumber, {
      [A.optedOut]: reason,
      [A.optedOutAt]: nowIso(),
    });
    return { ok: true, found: true, name, reason };
  });
}

// Clear a lead's opt-out (resubscribe). Reminders they are still eligible for
// resume on the next tick — dueReminders' window means only the ones still ahead
// of the workshop fire, not a stacked burst of stale ones.
export async function clearOptOut(token: string): Promise<OptOutResult> {
  return withSheetLock("clearOptOut", async () => {
    const auto = await readTable(env.autoTab());
    const row = auto.rows.find((r) => cell(auto, r, A.token) === token);
    if (!row) return { ok: true, found: false };
    const name = cell(auto, row, A.name) || "there";
    if (!cell(auto, row, A.optedOut)) return { ok: true, found: true, name }; // already subscribed
    await updateRow(auto, row.rowNumber, { [A.optedOut]: "", [A.optedOutAt]: "" });
    return { ok: true, found: true, name };
  });
}

export function optOutStateForToken(auto: Table, token: string): {
  found: boolean;
  name?: string;
  optedOut?: string;
} {
  const row = auto.rows.find((r) => cell(auto, r, A.token) === token);
  if (!row) return { found: false };
  return { found: true, name: cell(auto, row, A.name) || "there", optedOut: cell(auto, row, A.optedOut) };
}

// Retire rows that are the same person as another row, keyed on phone number.
// Backstop for read-modify-write races (a form ingest and a registration landing
// milliseconds apart both appended). Keeps the registered row if there is one,
// else the oldest, and marks the rest opted_out=duplicate so the gate skips them.
// Never deletes — retiring keeps the lead_id in knownIds so nothing re-ingests.
export async function reconcileDuplicates(): Promise<{ retired: number; groups: number }> {
  return withSheetLock("reconcileDuplicates", async () => {
    const auto = await readTable(env.autoTab());

    // Rows still in play. A dead channel does NOT take a row out of contention —
    // it may still be messaged on the other one, so it can still be half of a
    // double-messaging pair. Only intent (opted_out) retires a row.
    const active = auto.rows.filter((r) => !cell(auto, r, A.optedOut).trim());

    // Union-find over the active rows. Both passes below contribute edges, and a
    // row can be caught by both — merging first means each cluster of duplicates
    // elects exactly one keeper, instead of one pass retiring the very row the
    // other pass elected to keep.
    const parent = active.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    const union = (a: number, b: number) => {
      const [ra, rb] = [find(a), find(b)];
      if (ra !== rb) parent[ra] = rb;
    };

    // Pass 1 — same phone number. Same channel, so the name is irrelevant:
    // whoever holds the phone gets the message either way.
    const byPhone = new Map<string, number[]>();
    active.forEach((r, i) => {
      const pk = cell(auto, r, A.phoneKey);
      if (!pk) return; // phone-less leads can't be phone-deduped
      (byPhone.get(pk) ?? byPhone.set(pk, []).get(pk)!).push(i);
    });
    for (const idxs of Array.from(byPhone.values())) {
      for (let k = 1; k < idxs.length; k++) union(idxs[0], idxs[k]);
    }

    // Pass 2 — same email AND the same person. Email alone is not enough:
    // hello@ and info@ addresses are shared company mailboxes, so two colleagues
    // can legitimately register from one. samePerson() is what keeps them apart,
    // and it errs towards leaving a duplicate in place rather than retiring a
    // real attendee.
    const byEmail = new Map<string, number[]>();
    active.forEach((r, i) => {
      const em = cell(auto, r, A.email).trim().toLowerCase();
      if (!em) return;
      (byEmail.get(em) ?? byEmail.set(em, []).get(em)!).push(i);
    });
    for (const idxs of Array.from(byEmail.values())) {
      if (idxs.length < 2) continue;
      for (let a = 0; a < idxs.length; a++) {
        for (let b = a + 1; b < idxs.length; b++) {
          const na = cell(auto, active[idxs[a]], A.name);
          const nb = cell(auto, active[idxs[b]], A.name);
          if (samePerson(na, nb)) union(idxs[a], idxs[b]);
        }
      }
    }

    const clusters = new Map<number, number[]>();
    active.forEach((_, i) => {
      const root = find(i);
      (clusters.get(root) ?? clusters.set(root, []).get(root)!).push(i);
    });

    let retired = 0;
    let groups = 0;
    for (const idxs of Array.from(clusters.values())) {
      if (idxs.length < 2) continue;
      groups++;
      const rows = idxs.map((i) => active[i]);
      // Keeper: a registered row wins; otherwise the earliest-created.
      const keeper =
        rows.find((r) => isDone(cell(auto, r, A.done))) ??
        rows.slice().sort((a, b) =>
          (cell(auto, a, A.createdAt) || "").localeCompare(cell(auto, b, A.createdAt) || ""),
        )[0];
      for (const r of rows) {
        if (r === keeper) continue;
        if (isDone(cell(auto, r, A.done))) continue; // never retire a registered row
        await updateRow(auto, r.rowNumber, {
          [A.optedOut]: OPT_OUT.duplicate,
          [A.optedOutAt]: nowIso(),
        });
        retired++;
      }
    }
    return { retired, groups };
  });
}
