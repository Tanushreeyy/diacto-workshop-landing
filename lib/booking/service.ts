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
  STATUS,
  LeadStatus,
  STATUS_SOURCE,
  StatusSource,
  policyFor,
  outranks,
  leadAlertFields,
  LeadAlertField,
} from "./config";
import {
  loadCampaign,
  campaignProblems,
  describeCampaign,
  hasEnded,
  Campaign,
} from "./campaign";
import {
  readSwitches,
  readHeaderBaseline,
  writeHeaderBaseline,
  readSetting,
  loadTabOverrides,
  ALL_ON,
  Switches,
} from "./control";
import {
  checkAutomationTable,
  headerFingerprint,
  detectHeaderDrift,
  MAX_PROMO_PER_DAY,
} from "./preflight";
import { withSheetLock } from "./lock";
import {
  readTable,
  readCellLive,
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
import { emailFor, waParamsFor, MsgCtx, WaRole } from "./messages";
import { dueForNurture, dueReminders, isQuietHours, nowIso } from "./schedule";
import { phoneKey, toE164, isValidPhone, phoneProblem } from "./phone";
import { samePerson } from "./names";
import { pollMailReplies } from "./mailReplies";
import { syncCallingDispositions, syncFormRemarks } from "./callingSync";
import { checkWhatsAppDelivery } from "./delivery";

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
  years: "years_in_business",
  // The three CandidHR qualifiers. Written at ingest and never touched again —
  // they exist so a salesperson can sort the call list by who can actually buy
  // and who is ready to. Not in preflight's REQUIRED list: a workshop sheet has
  // no such columns and must keep running without them.
  authority: "decision_authority",
  timeline: "automation_timeline",
  screeningTool: "current_screening_tool",
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
  // ONE status column, shared vocabulary with the calling team's sheet. See
  // STATUS/POLICY in config.ts for what each value permits. Blank = active, so
  // clearing the cell puts someone back in the campaign.
  status: "status",
  statusAt: "status_at",
  statusSource: "status_source",
  // What they last wrote back, so the callers can see it without digging
  // through a shared mailbox. Snippet only — we are not mirroring their inbox.
  lastReply: "last_reply",
  lastReplyAt: "last_reply_at",
  // Promotional touches sent to this person today, and the IST day they belong
  // to. Read together: a stale day means the count is zero, so nothing needs
  // resetting at midnight.
  promoToday: "promo_today",
  promoDay: "promo_day",
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
  //
  // The "what's_your_…" / "enter_your_…" spellings come from the HR Campaign form,
  // where Meta named each column after the question as the client phrased it. They
  // matter more than the older variants did: the HR flow (sdr_assisted) has NO
  // landing page, so a column that fails to resolve is not "collected later" — the
  // answer is gone. All four HR qualifiers missed before these were added, which
  // would have handed the SDRs a call list with no designation, company or team
  // size, and rendered wa_lead_alert_full as four dashes out of seven.
  designation: [
    "designation",
    "your_designation",
    "what_is_your_designation",
    "whats_your_designation",
  ],
  company: [
    "company_name",
    "company",
    "organization_name",
    "organisation_name",
    "enter_your_company_name",
    // CandidHR's Instant Form phrases it "name_of_company". Verified against the
    // live LeadsSheet_New header — without this the only company-shaped field on
    // a lead_capture row is blank, and the SDR gets a call list of bare names.
    "name_of_company",
  ],
  employeeCount: [
    "no_of_employees",
    "number_of_employees",
    "employee_count",
    "employees",
    "company_size",
    "whats_your_employee_count",
  ],
  // The new Instant Form (Campaign2 tab) phrases it "where_are_you_based?"; the older
  // forms used "organization_location". The landing page prefills + hides it either way.
  location: [
    "organization_location",
    "organisation_location",
    "where_are_you_based",
    "where_are_you_located",
    "location",
    "city",
  ],
  // Added by the unified Saturday Instant Form ("years_in_business?"). Absent from
  // the older tabs — resolveHeader returns null there and the field stays blank,
  // which the full ops alert renders as "—".
  years: [
    "years_in_business",
    "how_many_years_in_business",
    "years_in_operation",
    "business_age",
  ],

  // Which creative produced the lead. Four are running on the CandidHR campaign
  // (FC_Static1/2, FC_Video1/2) and nothing downstream records which one
  // converted, so "which creative should we scale?" can only be answered in Ads
  // Manager, unjoined to what the SDR found on the call. Folded into the
  // existing `source` column rather than a new one — see the append below.
  adName: ["ad_name", "adname", "ad"],

  // ── The three CandidHR qualifiers (lead_capture) ──
  //
  // These are the whole reason that form is ten questions long: the client
  // accepted a lower lead volume and a higher cost per lead to get authority,
  // timeline and current tooling before the first call. If a column fails to
  // resolve the answer is simply GONE — lead_capture has no landing page to ask
  // again on — so each lists every phrasing the form might ship with, exactly as
  // the HR qualifiers had to after all four of theirs missed.
  authority: [
    "are_you_involved_in_selecting_or_purchasing_recruitment/hiring_technology",
    "are_you_involved_in_selecting_or_purchasing_recruitment_hiring_technology",
    "are_you_involved_in_selecting_or_purchasing_recruitment_technology",
    "decision_authority",
    "authority",
  ],
  timeline: [
    "when_are_you_looking_to_automate_your_recruitment_process",
    "when_are_you_looking_to_automate_your_recruitment",
    "automation_timeline",
    "timeline",
  ],
  screeningTool: [
    "what_are_you_currently_using_for_candidate_screening",
    "what_do_you_currently_use_for_candidate_screening",
    "current_screening_tool",
    "screening_tool",
  ],
};

// Meta writes the SLUG of a multiple-choice answer, not the label the person saw:
// "i_make_the_decision", "_ceo_/_founder_/_managing_director", "less_than_20".
// Left alone those land in the sheet and, worse, in the Slack line an SDR reads
// before dialling — "Buying role: *i_make_the_decision*" is the qualifier we
// traded lead volume for, rendered as a database key.
//
// Sentence case per "/"-separated segment rather than title case, because these
// values are two different shapes: role lists ("ceo / founder / managing
// director") want each segment capitalised, sentences ("i make the decision",
// "less than 20") want only the first word. Segment-wise sentence case is the
// one rule that reads correctly for both.
//
// Applied to CHOICE fields only. Free text — name, company, city — is left
// exactly as typed; "correcting" somebody's company name is not ours to do.
const ACRONYMS = new Set([
  "ceo", "cto", "coo", "cfo", "chro", "hr", "ta", "ats", "hrms", "crm", "ai", "it", "bpo", "sme",
]);
const PROPER: Record<string, string> = {
  google: "Google",
  excel: "Excel",
  linkedin: "LinkedIn",
  naukri: "Naukri",
  sheets: "Sheets",
  indeed: "Indeed",
  candidhr: "CandidHR",
};

export function prettyChoice(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  // Anything that is not a Meta slug — free text, an already-clean label, a
  // number — is returned untouched. Slugs are lowercase words joined by
  // underscores; a value with spaces or capitals is somebody's own writing.
  if (/[A-Z]/.test(v) || /\s/.test(v)) return v;
  // Anything that looks like an address, a URL or an id is data, not a label.
  // Belt and braces: this is only ever called on choice fields, but a form that
  // one day offers "other — please specify" would put free text through here.
  if (/[@:]|\.[a-z]/i.test(v)) return v;
  if (!v.includes("_")) {
    const one = v.toLowerCase();
    if (ACRONYMS.has(one)) return one.toUpperCase();
    return PROPER[one] ?? one.charAt(0).toUpperCase() + one.slice(1);
  }
  return v
    .split("/")
    .map((segment) => {
      const words = segment
        .replace(/_/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => {
          const lower = w.toLowerCase();
          if (ACRONYMS.has(lower)) return lower.toUpperCase();
          return PROPER[lower] ?? lower;
        });
      if (!words.length) return "";
      // Capitalise the segment's first word unless it is already an acronym or a
      // known proper noun, both of which carry their own casing.
      const first = words[0];
      if (first === first.toUpperCase() && first.length <= 5) return words.join(" ");
      if (Object.values(PROPER).includes(first)) return words.join(" ");
      words[0] = first.charAt(0).toUpperCase() + first.slice(1);
      return words.join(" ");
    })
    .filter(Boolean)
    .join(" / ");
}

const isDone = (v: string) => (v || "").trim().toUpperCase() === "TRUE";

export interface Prefill {
  name: string;
  email: string;
  phone: string;
  designation: string;
  company: string;
  location: string;
  employeeCount: string;
  years: string;
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
const genRegId = (c: Campaign) =>
  `${c.event.regIdPrefix}-${c.event.mmdd}-${crypto
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

function ctxFor(c: Campaign, name: string, token: string, regId?: string): MsgCtx {
  return {
    firstName: firstNameOf(name),
    bookingLink: registrationLink(token),
    passUrl: passUrl(token),
    unsubscribeUrl: unsubscribeLink(token),
    regId,
    // The campaign's event, not the module constant. WORKSHOP is now only a
    // fallback for sheets that predate the control-tab campaign config.
    dateLabel: c.event.dateLabel,
    dateShort: c.event.dateShort,
    timeLabel: c.event.timeLabel,
    venue: c.event.venue,
    mapUrl: c.event.mapUrl,
    support: c.supportNumber,
    // lead_capture only — WA {{2}} and the EM-10 CTA. Harmless on the workshop
    // flows, whose templates never reference it.
    demoVideoUrl: c.demoVideoUrl,
  };
}

/** Event Pass fields for this campaign — so the pass prints the right workshop. */
function passDataFor(c: Campaign, name: string, company: string, regId: string) {
  return {
    name,
    company,
    regId,
    dateLabel: c.event.dateLabel,
    timeLabel: c.event.timeLabel,
    venue: c.event.venue,
    support: c.supportNumber,
    // undefined, not "", so pass.ts falls back to its literal for any cell the
    // control tab leaves blank. Passing "" would draw an empty line instead.
    ...Object.fromEntries(
      Object.entries(c.event.pass).filter(([, v]) => String(v).trim()),
    ),
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
    years: cell(auto, row, A.years),
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
  await loadTabOverrides(); // control-tab tab-name overrides, before any tab is resolved
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
  c: Campaign,
  l: Prefill,
  regId: string,
  token: string,
  // The tick already holds the switches. Passing them in stops sdr_assisted
  // ingest doing a fresh control-tab read for every single lead — which on a busy
  // tick is one extra Sheets call per person, against the quota this project
  // trips first. Registration (over the web) has none to hand and reads its own.
  known?: Switches,
): Promise<{ sent: string[]; failed: string[] }> {
  const ctx = ctxFor(c, l.name, token, regId);
  const sent: string[] = [];
  const failed: string[] = [];

  // Registration comes in over the web, not through the tick, so the switches
  // are read here rather than passed down. The channel switches deliberately
  // cover the Event Pass too: if email is off because the domain is in trouble,
  // "except this one" is not a useful exception. Fails open — an unreadable
  // control tab must never block someone's pass.
  const switches = known ?? (await readSwitches().catch(() => ALL_ON));

  if (l.phone && switches.whatsapp) {
    try {
      await sendTemplate({
        whatsappNumber: l.phone,
        templateName: c.templates.wa5,
        parameters: waParamsFor("wa5", ctx),
      });
      sent.push("WA-5");
    } catch (e) {
      failed.push(failure("WA-5", e));
      console.error(`[register] WA-5 failed for ${regId}:`, e);
    }
  }
  if (l.email && switches.email) {
    try {
      const pass = await generatePassBase64(passDataFor(c, l.name, l.company, regId));
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
  await loadTabOverrides(); // resolve tab names the same way the tick does — no split-brain
  // Same campaign the tick would use, loaded the same way. A registration that
  // used different dates or a different template from the tick's reminders would
  // be worse than one that failed.
  const c = await loadCampaign();
  return withSheetLock("registerLead", () => registerLeadLocked(c, input), env.sheetId());
}

async function registerLeadLocked(
  c: Campaign,
  input: RegistrationInput,
): Promise<RegisterResult> {
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

  const regId = genRegId(c);
  const token = row ? cell(auto, row, A.token) || genToken() : genToken();

  // The user's typed values win over whatever Meta had (profile emails go stale).
  const fields: Record<string, string> = {
    [A.name]: input.name,
    [A.phone]: e164,
    [A.phoneKey]: key,
    [A.email]: input.email,
    [A.expectations]: input.expectations,
    // Registering is a deliberate act, and it is happening NOW — newer than
    // whatever stopped this row before. So it clears the stop. A caller's "Junk"
    // from Tuesday does not get to silence someone who signed up on Wednesday
    // and is expecting an Event Pass and a reminder.
    //
    // This is the one place a status is cleared without a human doing it, which
    // is why it is tied to registration specifically rather than to any inbound
    // activity: a reply is ambiguous, filling in the form is not.
    [A.status]: "",
    [A.statusAt]: "",
    [A.statusSource]: "",
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
    [A.years, input.years],
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
    : { name: "", email: "", phone: "", designation: "", company: "", location: "", employeeCount: "", years: "", expectations: "" };
  const pick = (typed: string, had: string) => typed || had;
  const lead: Prefill = {
    name: pick(input.name, was.name),
    email: pick(input.email, was.email),
    phone: e164,
    designation: pick(input.designation, was.designation),
    company: pick(input.company, was.company),
    location: pick(input.location, was.location),
    employeeCount: pick(input.employeeCount, was.employeeCount),
    years: pick(input.years, was.years),
    expectations: pick(input.expectations, was.expectations),
  };

  const { sent, failed } = await sendConfirmation(c, lead, regId, token);

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
  years: string;
  // lead_capture only; blank on every workshop form.
  authority: string;
  timeline: string;
  screeningTool: string;
  /** lead_capture only: the Meta ad that produced this lead. */
  adName: string;
}

async function ingestLead(
  c: Campaign,
  auto: Table,
  l: FormLead,
  ledger: PromoLedger,
  switches: Switches,
): Promise<void> {
  const token = genToken();
  const e164 = toE164(l.phone);
  const key = phoneKey(l.phone);
  const waProblem = e164 ? phoneProblem(e164) : "no number";

  // THE FLOW FORK.
  //
  // self_serve   — arriving on the form is an ENQUIRY. The row starts unregistered,
  //                WA-1/EM-1 carry a booking link, and the nurture ladder chases
  //                whoever never taps it. Registration happens later, on the
  //                landing page, and that is what earns the Event Pass.
  //
  // sdr_assisted — arriving on the form IS the registration ("Confirmation Step 1",
  //                agreed with the client on 1 Aug 2026). There is no booking link
  //                to send and nothing to chase: SDRs confirm attendance by phone.
  //                So the row is born registered, gets its reg ID immediately, and
  //                the confirmation + Event Pass go out at once.
  const isSdrAssisted = c.flow === "sdr_assisted";
  //
  // lead_capture   — arriving on the form is a SALES ENQUIRY and nothing more.
  //                  There is no event to register for, so there is no reg ID, no
  //                  Event Pass and no ladder. One acknowledgement goes out now,
  //                  the row is closed to further automation, and the sales team
  //                  calls. (CandidHR lead generation.)
  const isLeadCapture = c.flow === "lead_capture";

  // Meta's answer slugs become readable BEFORE anything is written or sent, so
  // the sheet, the Slack ping and the ops alert all carry the same clean value —
  // one normalisation point rather than three that can drift.
  //
  // lead_capture only, deliberately. The workshop forms carry the same slug
  // shapes, but their designation and team-size values are also prefilled into
  // the landing page form, and quietly changing what that field contains is not
  // a change to make to two live campaigns from inside an unrelated one.
  if (isLeadCapture) {
    l = {
      ...l,
      designation: prettyChoice(l.designation),
      employeeCount: prettyChoice(l.employeeCount),
      authority: prettyChoice(l.authority),
      timeline: prettyChoice(l.timeline),
      screeningTool: prettyChoice(l.screeningTool),
    };
  }
  const regId = isSdrAssisted ? genRegId(c) : "";

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
      // The ad name rides in `source` rather than a column of its own: `source`
      // is written and never parsed anywhere, so enriching it costs no schema
      // change on the two live workshop sheets.
      [A.source]: isLeadCapture && l.adName ? `meta_form:${l.adName}` : "meta_form",
      [A.createdAt]: nowIso(),
      [A.name]: l.name,
      // Present only on the v3 form; blank from the older one, and then asked for
      // on the landing page instead.
      [A.designation]: l.designation,
      [A.company]: l.company,
      [A.employeeCount]: l.employeeCount,
      [A.location]: l.location,
      [A.years]: l.years,
      // Spread, not three plain keys, and that is load-bearing: appendRow THROWS
      // on a key with no matching header. A workshop sheet has no qualifier
      // columns, so writing them unconditionally would fail every ingest on both
      // live campaigns the moment this shipped.
      ...(isLeadCapture
        ? {
            [A.authority]: l.authority,
            [A.timeline]: l.timeline,
            [A.screeningTool]: l.screeningTool,
          }
        : {}),
      [A.phone]: e164,
      [A.phoneKey]: key,
      [A.email]: l.email,
      [A.token]: token,
      [A.nurtureStage]: "0",
      [A.status]: waProblem ? STATUS.invalid_number : "",
      [A.statusAt]: waProblem ? nowIso() : "",
      [A.statusSource]: waProblem ? STATUS_SOURCE.validation : "",
      // sdr_assisted: the submission IS the registration, so the row is born
      // complete. This is also what makes the reminders apply to them — they are
      // sent to registered rows — and what keeps the nurture ladder off their back.
      [A.regId]: regId,
      // done closes a row to further automation. sdr_assisted sets it because the
      // submission IS the registration; lead_capture sets it because there is
      // nothing further to automate at all — the acknowledgement below is the
      // whole campaign, and the next contact is a human on the phone.
      [A.done]: isSdrAssisted || isLeadCapture ? "TRUE" : "",
      // …but registered_at stays blank for lead_capture. Nobody registered for
      // anything, and stamping it would put a registration count into every
      // report for a campaign that has no event to attend.
      [A.registeredAt]: isSdrAssisted ? nowIso() : "",
      // The promo ledger counts PROMOTIONAL touches. self_serve's WA-1 is one — it
      // is chasing a booking. sdr_assisted's confirmation is transactional, exactly
      // like the Event Pass, so it must not consume someone's daily allowance.
      // Same exemption as sdr_assisted's confirmation, for the same reason: this
      // acknowledges something the person just did and names who will call them.
      // It is submitted to Meta as UTILITY, and counting it against a marketing
      // allowance would be counting a receipt as an advert.
      [A.promoToday]: isSdrAssisted || isLeadCapture ? "0" : "1",
      [A.promoDay]: istDay(),
      [A.lastNudge]: nowIso(),
    });
    return true;
  }, env.sheetId());
  if (!didAppend) return; // already present — nothing sent

  // ── lead_capture: one acknowledgement, then humans. ──
  //
  // Deliberately BEFORE the promo-limit gate below, on the same reasoning as the
  // sdr_assisted confirmation: this is the receipt for something the person just
  // submitted, and withholding it to stay under a marketing quota would leave a
  // sales enquiry unanswered while the ad that produced it kept spending.
  if (isLeadCapture) {
    const ctx = ctxFor(c, l.name, token);
    const sent: string[] = [];
    const failed: string[] = [];

    if (waProblem) {
      console.warn(`[ingest] ${l.leadId}: unreachable number ${e164} — ${waProblem}`);
    }
    if (e164 && !waProblem && switches.whatsapp) {
      try {
        await sendTemplate({
          whatsappNumber: e164,
          templateName: c.templates.leadFollowup,
          parameters: waParamsFor("lead", ctx),
        });
        sent.push("WA-LEAD");
      } catch (e) {
        failed.push(failure("WA-LEAD", e));
        console.error(`[ingest] WA-LEAD failed for ${l.leadId}:`, e);
      }
    }
    if (l.email && switches.email) {
      try {
        const { subject, html } = emailFor("EM10", ctx);
        await sendMail({ to: l.email, subject, html });
        sent.push("EM-10");
      } catch (e) {
        failed.push(failure("EM-10", e));
        console.error(`[ingest] EM-10 failed for ${l.leadId}:`, e);
      }
    }

    // The qualifiers are the whole point of the ten-question form — the client
    // accepted fewer, costlier leads to get them. Printing them here is what
    // makes that trade pay off: whoever picks up the call list can see authority
    // and timeline in Slack and rank the queue without opening the sheet. Each
    // is omitted when blank rather than rendered as a dash, so an older form tab
    // that lacks the columns produces a shorter message, not a misleading one.
    await notifySlack(
      `:inbox_tray: *New lead — sales enquiry* (${c.label})\n` +
        `• ${l.name || "Unknown"}` +
        (l.designation ? `, ${l.designation}` : "") +
        (l.company ? ` @ ${l.company}` : "") +
        `\n• ${e164 || "no number"} · ${l.email || "no email"}` +
        (l.employeeCount ? `\n• Employees: ${l.employeeCount}` : "") +
        (l.location ? `\n• ${l.location}` : "") +
        (l.authority ? `\n• Buying role: *${l.authority}*` : "") +
        (l.timeline ? `\n• Timeline: *${l.timeline}*` : "") +
        (l.screeningTool ? `\n• Screening today: ${l.screeningTool}` : "") +
        (sent.length ? `\n• Sent: ${sent.join(" + ")}` : "") +
        (failed.length ? `\n• :warning: Failed: ${failed.join(", ")}` : "") +
        `\n• _Sales team to review and call._`,
    );
    await alertOpsNewLead(c, l, e164).catch((e) =>
      console.error(`[ingest] ops WhatsApp alert failed for ${l.leadId}:`, e),
    );
    return;
  }

  // ── sdr_assisted: confirmation + Event Pass, right now. ──
  //
  // Deliberately BEFORE the promo-limit gate below: this is a transactional
  // message the person earned by registering, and withholding somebody's Event
  // Pass to stay under a marketing quota would be the wrong failure. Same
  // reasoning config.ts gives for exempting confirmations and reminders.
  if (isSdrAssisted) {
    const lead: Prefill = {
      name: l.name,
      email: l.email,
      phone: e164,
      designation: l.designation,
      company: l.company,
      location: l.location,
      employeeCount: l.employeeCount,
      years: l.years,
      expectations: "",
    };
    const r = await sendConfirmation(c, lead, regId, token, switches);
    if (r.sent.some((s) => s.startsWith("EM-5"))) {
      await withSheetLock("ingestLead.passSent", async () => {
        const fresh = await readTable(env.autoTab());
        const mine = fresh.rows.find((x) => cell(fresh, x, A.token) === token);
        if (mine) await updateRow(fresh, mine.rowNumber, { [A.passSent]: nowIso() });
      }, env.sheetId());
    }
    await notifySlack(
      `:inbox_tray: *New lead — registered on submission* (${c.label})\n` +
        `• ${l.name || "Unknown"}` +
        (l.designation ? `, ${l.designation}` : "") +
        (l.company ? ` @ ${l.company}` : "") +
        `\n• Reg ID: *${regId}*` +
        `\n• ${e164 || "no number"} · ${l.email || "no email"}` +
        (r.sent.length ? `\n• Sent: ${r.sent.join(" + ")}` : "") +
        (r.failed.length ? `\n• :warning: Failed: ${r.failed.join(", ")}` : "") +
        `\n• _SDR to call and confirm attendance._`,
    );
    await alertOpsNewLead(c, l, e164).catch((e) =>
      console.error(`[ingest] ops WhatsApp alert failed for ${l.leadId}:`, e),
    );
    return;
  }

  const ctx = ctxFor(c, l.name, token);
  const sent: string[] = [];
  const failed: string[] = [];

  // Same daily ceiling as nurture. A brand-new row normally has no history, so
  // this only bites when the person already exists under another row — which is
  // precisely the state a broken dedupe produces, and the state that sent one
  // man the same email 35 times.
  if (!promoAllowedForLead(ledger, l.email, l.phone)) {
    console.warn(`[ingest] ${l.leadId}: daily promo limit reached for this person — no WA-1/EM-1`);
    await notifySlack(
      `:no_bell: Skipped the welcome message for *${l.name || l.leadId}* — they have already had ` +
        `${MAX_PROMO_PER_DAY} promotional message(s) today. Their row was still created.`,
    );
    return;
  }
  for (const k of [
    l.email ? `e:${l.email.trim().toLowerCase()}` : "",
    phoneKey(l.phone || "") ? `p:${phoneKey(l.phone)}` : "",
  ].filter(Boolean)) {
    ledger.set(k, (ledger.get(k) ?? 0) + 1);
  }

  // Validate before the first send rather than discovering it on every tick for
  // the next ten days. A typo'd number is caught the moment the lead arrives.
  if (waProblem) {
    console.warn(`[ingest] ${l.leadId}: unreachable number ${e164} — ${waProblem}`);
  }
  if (e164 && !waProblem && switches.whatsapp) {
    try {
      await sendTemplate({
        whatsappNumber: e164,
        templateName: c.templates.wa1,
        parameters: waParamsFor("wa1", ctx),
      });
      sent.push("WA-1");
    } catch (e) {
      failed.push(failure("WA-1", e));
      console.error(`[ingest] WA-1 failed for ${l.leadId}:`, e);
    }
  }
  if (l.email && switches.email) {
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

  // WhatsApp ops alert — the client wants a WhatsApp ping (not just Slack) on each
  // instant-form lead. Fire-and-forget and deliberately NOT gated by the client
  // WhatsApp kill-switch: this is an internal notification, not campaign messaging,
  // so silencing leads must not silence the team's own heads-up. No-op until a
  // number is set in the control tab AND the alert template is approved in WATI.
  await alertOpsNewLead(c, l, e164).catch((e) =>
    console.error(`[ingest] ops WhatsApp alert failed for ${l.leadId}:`, e),
  );
}

// Ping the ops number(s) in the control tab (`lead_alert_number`, comma/space
// separated) with the new lead. Uses the safeproof template ({{1}} name · {{2}}
// phone) by default — both are always present. Never throws: a missing number, a
// still-pending template or a WATI hiccup must not fail an ingest that already
// created the row and messaged the lead.
async function alertOpsNewLead(c: Campaign, l: FormLead, e164: string): Promise<void> {
  const raw = (await readSetting("lead_alert_number")) || "";
  const numbers = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!numbers.length) return;
  // The campaign's own template, not the env default. This was reading
  // WA_LEAD_ALERT_TEMPLATE — so a control tab that asked for the 7-field alert
  // still got the 2-field one, and the param count below was decided from the
  // env name rather than the one actually being sent.
  const template = c.templates.leadAlert;
  if (!template) return;
  // Meta rejects a template send with an empty (or newline-bearing) body param, so
  // every value is squashed to a single line and falls back to "—" when the lead
  // left it blank or the form tab lacks that column (older forms have no years/loc).
  const v = (x: string) => (x || "").replace(/\s+/g, " ").trim() || "—";
  // Which fields, and in what order, comes from leadAlertFields() — the same
  // function the pre-flight check uses, so the two can never disagree about a
  // param count that WATI will reject outright.
  const value: Record<LeadAlertField, string> = {
    campaign: c.label,
    name: l.name,
    phone: e164 || l.phone,
    email: l.email,
    company: l.company,
    designation: l.designation,
    employeeCount: l.employeeCount,
    location: l.location,
    years: l.years,
  };
  const parameters = leadAlertFields(template).map((f, i) => ({
    name: String(i + 1),
    value: v(value[f]),
  }));
  for (const number of numbers) {
    try {
      await sendTemplate({ whatsappNumber: number, templateName: template, parameters });
    } catch (e) {
      console.error(`[ingest] ops alert to ${number} failed:`, e);
    }
  }
}


// ---- promotional send budget ----------------------------------------------
//
// How many chasing messages one PERSON has already had today. Keyed by email and
// phone rather than by row, because the same human can hold more than one row —
// that is exactly what happened in July, and a per-row counter would have handed
// each duplicate its own fresh allowance.

/** IST calendar day. The nurture windows are IST, so the day must roll at IST midnight. */
export function istDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

function recipientKeys(auto: Table, row: SheetRow): string[] {
  const keys: string[] = [];
  const em = cell(auto, row, A.email).trim().toLowerCase();
  if (em) keys.push(`e:${em}`);
  const pk = cell(auto, row, A.phoneKey).trim();
  if (pk) keys.push(`p:${pk}`);
  return keys;
}

export type PromoLedger = Map<string, number>;

export function buildPromoLedger(auto: Table, day = istDay()): PromoLedger {
  const ledger: PromoLedger = new Map();
  for (const row of auto.rows) {
    if (cell(auto, row, A.promoDay).trim() !== day) continue; // stale day = zero
    const n = parseInt(cell(auto, row, A.promoToday) || "0", 10) || 0;
    if (n <= 0) continue;
    // A person's tally is the highest count on any of their rows, not the sum:
    // two rows for one person each recording their own touches would otherwise
    // double-count a single send.
    for (const k of recipientKeys(auto, row)) {
      ledger.set(k, Math.max(ledger.get(k) ?? 0, n));
    }
  }
  return ledger;
}

function promoSentToday(ledger: PromoLedger, auto: Table, row: SheetRow): number {
  return Math.max(0, ...recipientKeys(auto, row).map((k) => ledger.get(k) ?? 0));
}

/** May we send this person another promotional message today? */
export function promoAllowed(ledger: PromoLedger, auto: Table, row: SheetRow): boolean {
  return promoSentToday(ledger, auto, row) < MAX_PROMO_PER_DAY;
}

/** As promoAllowed, for a lead that has no row yet (the first ingest touch). */
export function promoAllowedForLead(
  ledger: PromoLedger,
  email: string,
  phone: string,
): boolean {
  const keys: string[] = [];
  const em = (email || "").trim().toLowerCase();
  if (em) keys.push(`e:${em}`);
  const pk = phoneKey(phone || "");
  if (pk) keys.push(`p:${pk}`);
  const sent = Math.max(0, ...keys.map((k) => ledger.get(k) ?? 0));
  return sent < MAX_PROMO_PER_DAY;
}

/** Record one promotional touch, in the ledger and on the row. */
async function recordPromo(ledger: PromoLedger, auto: Table, row: SheetRow): Promise<void> {
  const day = istDay();
  const next = promoSentToday(ledger, auto, row) + 1;
  for (const k of recipientKeys(auto, row)) ledger.set(k, next);
  await updateRow(auto, row.rowNumber, {
    [A.promoToday]: String(next),
    [A.promoDay]: day,
  });
}

// A lead's address/number, or "" when that channel is marked dead. Every send
// site already skips a falsy value, so returning "" is all it takes to mute one
// channel and leave the other running.
// `switches` is required rather than optional on purpose. Folding the kill
// switch in here — instead of checking it at each send site — is what stops a
// disabled channel from being mistaken for an available one by runTick, which
// has to decide whether a row is worth entering at all. An optional parameter
// would let a future caller omit it and quietly get the old, wrong answer.
export function emailUsable(auto: Table, row: SheetRow, switches: Switches): string {
  if (!switches.email) return "";
  if (!policyFor(cell(auto, row, A.status)).email) return "";
  return cell(auto, row, A.email);
}

export function phoneUsable(auto: Table, row: SheetRow, switches: Switches): string {
  if (!switches.whatsapp) return "";
  if (!policyFor(cell(auto, row, A.status)).wa) return "";
  const phone = cell(auto, row, A.phone);
  // Enforced here as well as in the column, so a number that cannot possibly
  // receive a message is never tried even if nobody has marked it by hand.
  if (phone && phoneProblem(phone)) return "";
  return phone;
}

async function nurtureLead(
  c: Campaign,
  auto: Table,
  row: SheetRow,
  ledger: PromoLedger,
  switches: Switches,
): Promise<void> {
  const name = cell(auto, row, A.name);
  const phone = phoneUsable(auto, row, switches);
  const email = emailUsable(auto, row, switches);
  // Nothing can go out on any enabled channel, so claiming would burn a nurture
  // stage and a daily slot for a message nobody receives. The row is left
  // untouched and picked up whenever the channel comes back.
  if (!phone && !email) return;
  const token = cell(auto, row, A.token);
  const ctx = ctxFor(c, name, token);
  const stage = parseInt(cell(auto, row, A.nurtureStage) || "0", 10) || 0;
  // The chasing ladder: WA-2 → WA-3 → WA-4, then WA-4 repeats until they register.
  // Campaign-scoped now, so two campaigns cannot share one ladder.
  const ladder: [WaRole, string][] = [
    ["wa2", c.templates.wa2],
    ["wa3", c.templates.wa3],
    ["wa4", c.templates.wa4],
  ];
  const [role, tpl] = ladder[Math.min(stage, ladder.length - 1)];
  const emailKind = stage === 0 ? "EM2" : stage === 1 ? "EM3" : "EM4";

  const sent: string[] = [];
  const failed: string[] = [];

  // CLAIM BEFORE SENDING.
  //
  // This used to send first and record afterwards, which leaves the one window
  // that matters: if the write fails after WhatsApp has gone out — a Sheets blip,
  // a timeout, the process dying — the next tick sees an unchanged row and sends
  // the same message again. That is precisely the shape of the 17 July incident,
  // where sends succeeded and state did not persist.
  //
  // Recording first inverts the failure: a crash now costs one missed touch
  // instead of an unbounded resend loop. Given the history, under-sending is the
  // side to err on — and the person still gets the next touch tomorrow.
  await updateRow(auto, row.rowNumber, {
    [A.nurtureStage]: String(stage + 1),
    [A.lastNudge]: nowIso(),
  });
  await recordPromo(ledger, auto, row);

  if (phone) {
    try {
      await sendTemplate({
        whatsappNumber: phone,
        templateName: tpl,
        parameters: waParamsFor(role, ctx),
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


  await notifySlack(
    `:bell: *Nudge* (touch ${stage + 1}) — ${name || "Unknown"}` +
      (sent.length ? ` · sent ${sent.join(" + ")}` : "") +
      (failed.length ? ` · :warning: failed ${failed.join(", ")}` : ""),
  );
}

async function remindLead(
  c: Campaign,
  auto: Table,
  row: SheetRow,
  switches: Switches,
): Promise<number> {
  const sentCsv = cell(auto, row, A.remindersSent);
  const due = dueReminders(sentCsv, c.reminders, c.event.startMs);
  if (!due.length) return 0;

  const name = cell(auto, row, A.name) || "Guest";
  const company = cell(auto, row, A.company);
  const email = emailUsable(auto, row, switches);
  const phone = phoneUsable(auto, row, switches);
  const regId = cell(auto, row, A.regId);
  const token = cell(auto, row, A.token);
  const ctx = ctxFor(c, name, token, regId || undefined);

  const already = new Set(sentCsv.split(",").map((s) => s.trim()).filter(Boolean));
  const justSent: string[] = [];
  const failed: string[] = [];

  for (const r of due) {
    // Establish that this reminder CAN go out before claiming it. Claiming first
    // and discovering the channel is unavailable afterwards loses the reminder
    // for good: the key is written to reminders_sent, the rollback below only
    // runs on a send failure, and dueReminders never returns a key it has seen.
    // With email switched off that silently voids EM6/EM7/EM8 on event day — the
    // attendee gets no pass and no directions, and nothing reports it.
    if (r.kind === "email" ? !email : !phone) continue;

    // CLAIM THIS REMINDER BEFORE SENDING, then release it if the send fails.
    //
    // Same reasoning as nurture — recording after the send means a write failure
    // resends — but the trade is different here, because a missed reminder is
    // worse than a missed nudge: someone does not turn up to an event they
    // registered for. So the claim is rolled back on failure, letting the next
    // tick retry. That retry cannot run away: dueReminders only returns a key
    // inside a 3-hour window, and never once the workshop has started.
    already.add(r.key);
    try {
      await updateRow(auto, row.rowNumber, {
        [A.remindersSent]: Array.from(already).join(","),
      });
    } catch (e) {
      already.delete(r.key);
      failed.push(failure(r.key, e));
      console.error(`[remind] could not claim ${r.key}, not sending:`, e);
      continue; // never send something we failed to record
    }
    try {
      if (r.kind === "email") {
        const kind = r.key === "EM6" ? "EM6" : r.key === "EM7" ? "EM7" : "EM8";
        const { subject, html } = emailFor(kind, ctx);
        const attachments = regId
          ? [
              {
                name: `Event_Pass_${firstNameOf(name)}.pdf`,
                contentBytes: await generatePassBase64(
                  passDataFor(c, name, company, regId),
                ),
                contentType: "application/pdf",
              },
            ]
          : undefined;
        await sendMail({ to: email, subject, html, attachments });
      } else {
        const [role, tpl]: [WaRole, string] =
          r.key === "WA6"
            ? ["wa6", c.templates.wa6]
            : r.key === "WA7"
              ? ["wa7", c.templates.wa7]
              : ["wa8", c.templates.wa8];
        await sendTemplate({
          whatsappNumber: phone,
          templateName: tpl,
          parameters: waParamsFor(role, ctx),
        });
      }
      justSent.push(r.key);
    } catch (e) {
      // Release the claim so the next tick can try again inside the window.
      already.delete(r.key);
      await updateRow(auto, row.rowNumber, {
        [A.remindersSent]: Array.from(already).join(","),
      }).catch(() => {
        // Rollback failed: the key stays claimed and this reminder is lost. Say
        // so loudly — silently dropping a reminder is the failure nobody notices
        // until an attendee does not arrive.
        console.error(`[remind] ${r.key} send FAILED and rollback FAILED — reminder lost`);
      });
      failed.push(failure(r.key, e));
      console.error(`[remind] ${r.key} failed:`, e);
    }
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
  campaign: string; // which campaign this tick ran for (see campaign.ts)
  halted: boolean; // preflight refused to run — the sheet looks damaged
  throttled: number; // rows held back by the per-person daily promo limit
  deferredIngest: number; // form rows left in place because no channel could carry WA-1/EM-1
  repliesStopped: number; // leads opted out this tick because they replied by email
  callerStops: number; // leads stopped this tick by a calling-team disposition
  deliveryFailed: number; // messages WATI accepted and Meta then refused
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

  // Load control-tab tab-name overrides BEFORE resolving any tab name below, so
  // form/automation/calling all point where the control tab says.
  await loadTabOverrides();

  // WHICH CAMPAIGN IS THIS? Loaded before anything is read for sending, because a
  // campaign we cannot describe is one we must not message for. loadCampaign
  // throws when the control tab is unreadable — deliberately fail-closed, unlike
  // the switches — so announce it rather than dying silently into a 500 that only
  // the cron caller ever sees.
  let campaign: Campaign;
  try {
    campaign = await loadCampaign();
  } catch (e) {
    await notifySlack(
      `:octagonal_sign: *TICK HALTED — campaign config could not be read.* Nothing was sent.\n` +
        `• ${(e as Error).message}`,
    ).catch(() => {});
    throw e;
  }

  // One tab per live Instant Form. A tab that doesn't exist yet (the next form's
  // connection hasn't run) resolves to null and is simply skipped.
  const tabs = env.formTabs();
  const [forms, autoSnapshot, switches] = await Promise.all([
    Promise.all(tabs.map((t) => readTable(t).catch(() => null))),
    readTable(env.autoTab()),
    readSwitches(),
  ]);
  // Reassignable: the sync and the reply poller below both write statuses, and
  // the loop that decides who to message must see them. See the re-read after
  // step 1c.
  let auto = autoSnapshot;

  const summary: TickSummary = {
    ingested: 0,
    nurtured: 0,
    remindersSent: 0,
    suppressed: 0,
    unreachable: 0,
    formRows: forms.reduce((n, f) => n + (f?.rows.length ?? 0), 0),
    leads: auto.rows.length,
    switches:
      `ingest=${switches.ingest} nurture=${switches.nurture} reminders=${switches.reminders}` +
      ` | email=${switches.email} whatsapp=${switches.whatsapp} deliveryCheck=${switches.deliveryCheck} [${switches.source}]` +
      // Ambient, not a switch — but it silently changes what a tick does, so it
      // belongs on the same line rather than being inferred from a zero count.
      (isQuietHours() ? ` | QUIET HOURS (22:00-09:00 IST)` : ``),
    campaign: describeCampaign(campaign),
    halted: false,
    throttled: 0,
    deferredIngest: 0,
    repliesStopped: 0,
    callerStops: 0,
    deliveryFailed: 0,
    truncated: false,
    errors: [],
  };

  // 0a) CAMPAIGN — do we know what we are running, and is it still running?
  //
  // Before the sheet is checked, because a valid sheet described by a broken
  // campaign is the more dangerous combination: everything looks healthy and the
  // messages go out carrying the wrong date. This is the check that would have
  // caught EVENT_* being unset in production on 1 Aug 2026, when the live campaign
  // was quietly running on a previous workshop's dates.
  const campaignIssues = campaignProblems(campaign);
  if (campaignIssues.length) {
    summary.errors.push(...campaignIssues.map((p) => `campaign: ${p}`));
    summary.halted = true;
    await notifySlack(
      `:octagonal_sign: *TICK HALTED — the campaign config is not usable.* Nothing was sent.\n` +
        campaignIssues.map((p) => `• ${p}`).join("\n") +
        `\n\nFix the \`control\` tab in the campaign's sheet; the next tick resumes on its own.`,
    ).catch(() => {});
    return summary;
  }

  // Auto-stop. Once the workshop has started there is nobody left to ingest,
  // chase or remind, and an old sheet left connected must not quietly keep
  // messaging people. Derived from the event itself so there is no flag for
  // anyone to forget. Silent by design — this is the normal end of a campaign,
  // not a fault, and it would otherwise announce itself every five minutes.
  if (hasEnded(campaign)) {
    summary.halted = true;
    summary.errors.push(
      `campaign ended — ${campaign.label} started at ${campaign.event.startUtc}`,
    );
    return summary;
  }

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

  // How much chasing each person has already had today. Built once from the same
  // snapshot the rest of the tick uses, then kept current in memory as we send.
  const ledger = buildPromoLedger(auto);

  // Evaluated ONCE for the whole tick rather than per lead, so a tick that
  // straddles 22:00 treats every lead in it the same way. Used by ingest (below,
  // self_serve only) and by nurture/reminders in step 2.
  const quietNow = isQuietHours();

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
    const cYears = resolveHeader(form, FORM.years);
    const cAuthority = resolveHeader(form, FORM.authority);
    const cTimeline = resolveHeader(form, FORM.timeline);
    const cScreening = resolveHeader(form, FORM.screeningTool);
    const cAdName = resolveHeader(form, FORM.adName);
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

      // Quiet hours gate the PROMOTIONAL half of ingest, and only that half.
      //
      // self_serve's WA-1 is a promotional message — it exists to chase a
      // booking — so it belongs under the same 22:00-09:00 IST rule as the
      // nurture ladder it begins. Ingest never consulted isQuietHours(), which
      // was invisible while leads trickled in one at a time and became very
      // visible the moment a backlog was released: 84 queued leads drained past
      // midnight and five people got a "book your seat" WhatsApp at 22:39.
      //
      // sdr_assisted is deliberately NOT deferred. There the form submission IS
      // the registration, so ingest sends a CONFIRMATION and the Event Pass —
      // transactional, expected, and worse when late. Somebody who signs up at
      // 23:00 should get their pass at 23:00, not at 09:00 the next morning.
      // Same distinction the promo ledger already draws a few lines below, where
      // sdr_assisted's confirmation is exempted from the daily promo allowance.
      //
      // Deferred, never dropped: the form row is simply left alone and ingest is
      // driven off the form tab, so the next tick after 09:00 picks it up with
      // its welcome intact.
      // lead_capture is not deferred either, for the same reason: its
      // acknowledgement is a receipt. Somebody who fills the form at 23:00 has
      // just been told a salesperson will call, and hearing nothing back until
      // 09:00 reads as a form that failed.
      if (quietNow && campaign.flow === "self_serve") {
        summary.deferredIngest++;
        continue;
      }

      // Do not create the row until a channel can actually carry the welcome.
      //
      // WA-1 and EM-1 are sent by ingestLead and NOWHERE else, while the append
      // stamps promo_today and last_nudge_at. Ingesting with the channel switched
      // off therefore burns the welcome permanently: the row exists, nothing was
      // sent, and when the switch comes back the lead is at stage 0 and gets WA-2
      // — never the registration link that WA-1 carries. Leaving the form row
      // alone costs nothing, because ingest is driven off the form tab and will
      // pick it up on the tick after the switch flips.
      //
      // The test is deliberately about the SWITCHES, not the lead. Someone whose
      // number is unusable and who left no email still gets a row, exactly as
      // before, so a human can see them and fix it.
      const e164 = toE164(phone);
      const waPossible = !!e164 && !phoneProblem(e164);
      const emailPossible = !!email;
      const canSendNow =
        (waPossible && switches.whatsapp) || (emailPossible && switches.email);
      const blockedOnlyBySwitch =
        (waPossible && !switches.whatsapp) || (emailPossible && !switches.email);
      if (!canSendNow && blockedOnlyBySwitch) {
        summary.deferredIngest++;
        continue;
      }

      try {
        await ingestLead(
          campaign,
          auto,
          {
            leadId,
            name,
            email,
            phone,
            designation: get(fr, cDesig),
            company: get(fr, cCompany),
            employeeCount: get(fr, cEmp),
            location: get(fr, cLoc),
            years: get(fr, cYears),
            authority: get(fr, cAuthority),
            timeline: get(fr, cTimeline),
            screeningTool: get(fr, cScreening),
            adName: get(fr, cAdName),
          },
          ledger,
          switches,
        );
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

  // 1b1) FORM-TAB DISPOSITIONS — the calling team's `Remark` column, written into
  // the form tab itself. Junk/Not Interested stop the lead; Confirmed marks them
  // registered (reminders yes, nudges no); everything else is left active. Runs
  // before nurture so this morning's disposition lands on this tick, not the next.
  try {
    const rem = await syncFormRemarks();
    summary.callerStops += rem.applied;
    if (rem.applied) {
      await notifySlack(
        `:memo: Applied *${rem.applied}* disposition(s) from the form tab's Remark column.`,
      );
    }
  } catch (e) {
    summary.errors.push(`form remarks: ${(e as Error).message}`);
  }

  // 1b2) CALLER DISPOSITIONS — what the humans on the phone learned. Runs before
  // nurture so a "Not Interested" recorded this morning stops today's follow-up
  // rather than one tick too late. Never allowed to sink the tick.
  try {
    if (env.callingTab()) {
      const sync = await syncCallingDispositions();
      summary.callerStops += sync.applied;
      // A tab that exists but could not be read is an error, not an absence.
      if (sync.error) summary.errors.push(sync.error);
      if (sync.applied) {
        await notifySlack(
          `:telephone_receiver: Applied *${sync.applied}* disposition(s) from the calling sheet — those leads will no longer be chased.`,
        );
      }
    }
  } catch (e) {
    summary.errors.push(`calling sync: ${(e as Error).message}`);
  }

  // 1c) REPLIES — anyone who has answered by email stops being chased. Runs
  // BEFORE nurture so a reply that arrived since the last tick takes effect on
  // this one, rather than one nudge too late. Never allowed to sink the tick:
  // missing consent degrades to "we stop noticing replies", which is bad, but
  // not as bad as no reminders going out at all.
  try {
    const replies = await pollMailReplies(auto);
    summary.repliesStopped = replies.optedOut;
    if (!replies.available) {
      summary.errors.push("mail replies: Mail.Read not granted — replies unseen");
    }
  } catch (e) {
    summary.errors.push(`mail replies: ${(e as Error).message}`);
  }

  // Re-read before deciding who to message. The snapshot above was taken before
  // the caller sync and the reply poller ran, and both of them stop people. On
  // the stale copy, someone who replied "please stop" this morning would receive
  // one more nudge and only fall silent on the NEXT tick — the one message that
  // matters most to get right. One extra read is a small price.
  if (summary.callerStops || summary.repliesStopped) {
    try {
      auto = await readTable(env.autoTab());
    } catch (e) {
      summary.errors.push(`re-read after stops: ${(e as Error).message}`);
    }
  }

  // 2) NURTURE (not yet registered) + REMINDERS (registered).
  //
  // lead_capture sends NOTHING here. Its whole campaign is the acknowledgement
  // ingest already sent; from then on the lead belongs to a salesperson, and an
  // automated follow-up landing in the middle of that conversation is worse than
  // no follow-up at all.
  //
  // Two things already make this true by accident — its rows are stamped done so
  // nurture skips them, and campaign.reminders is empty so dueReminders returns
  // nothing. Neither is a guarantee anyone reading this loop can see, and both
  // are one edit away from silently ceasing to hold. So it is said once, here.
  // Skips the loop, NOT the rest of the tick: the delivery check and the error
  // Slack ping below still have to run for this campaign — an acknowledgement
  // WATI accepted and Meta then dropped is exactly the failure a sales team
  // needs told about, and an ingest error must never go out silently.
  const rowsToMessage = campaign.flow === "lead_capture" ? [] : auto.rows;

  const quiet = quietNow;
  for (const row of rowsToMessage) {
    if (outOfTime()) { summary.truncated = true; break; }
    if (!cell(auto, row, A.token)) continue;

    // Opt-out gate — one place, every channel. ANY value in opted_out silences
    // everything, reminders included: once someone has replied, unsubscribed or
    // been retired as a duplicate we stop messaging them, full stop. Sits BEFORE
    // the isDone branch so it governs reminders too.
    const pol = policyFor(cell(auto, row, A.status));
    const registered = isDone(cell(auto, row, A.done));
    // Reminders and chasing are governed separately, so a registered attendee
    // whose mailbox bounced still gets reminded — over WhatsApp — on the day.
    if (registered ? !pol.reminders : !pol.nurture) {
      summary.suppressed++;
      continue;
    }

    // Channel health is a separate question from intent: this person has not
    // asked us to stop, we simply have no working address or number left. Skip
    // rather than walk into nurtureLead and do nothing.
    if (!emailUsable(auto, row, switches) && !phoneUsable(auto, row, switches)) {
      summary.unreachable++;
      continue;
    }

    try {
      // Last-moment freshness check, run ONLY for a row we are about to
      // message. Between the read above and this instant the tick has been
      // working through other rows, and in that window someone can unsubscribe,
      // reply, or be marked Junk by a caller. Re-checking the one cell here
      // narrows the gap from "however long the rest of the tick takes" to a few
      // hundred milliseconds.
      //
      // Deliberately not done for every row: only a handful are due on any given
      // tick, and a per-row read for all of them would spend the whole time
      // budget confirming that people we were not going to message are still
      // people we are not going to message.
      const stillAllowed = async (): Promise<boolean> => {
        const live = await readCellLive(auto, row.rowNumber, A.status).catch(
          () => cell(auto, row, A.status), // a blip must not block a legitimate send
        );
        const p = policyFor(live);
        return registered ? p.reminders : p.nurture;
      };

      if (registered) {
        // dueReminders is consulted first so the live read only happens when
        // something is actually going out.
        if (
          switches.reminders &&
          dueReminders(cell(auto, row, A.remindersSent), campaign.reminders, campaign.event.startMs)
            .length
        ) {
          if (!(await stillAllowed())) {
            summary.suppressed++;
            continue;
          }
          summary.remindersSent += await remindLead(campaign, auto, row, switches);
        }
        // Chasing only exists in self_serve, where a lead has a booking link they
        // have not yet tapped. In sdr_assisted the form submission already IS the
        // registration and humans do the following up, so there is nothing to
        // chase — and its wa2/wa3/wa4 slots are deliberately empty, which would
        // otherwise mean sending a blank template name.
      } else if (
        campaign.flow === "self_serve" &&
        switches.nurture &&
        !quiet &&
        dueForNurture(cell(auto, row, A.lastNudge))
      ) {
        // Hard ceiling on chasing, independent of whatever the schedule thinks.
        // If this ever bites, the schedule and the state disagree — which is the
        // shape every resend incident has taken.
        if (!promoAllowed(ledger, auto, row)) {
          summary.throttled++;
          continue;
        }
        if (!(await stillAllowed())) {
          summary.suppressed++;
          continue;
        }
        await nurtureLead(campaign, auto, row, ledger, switches);
        summary.nurtured++;
      }
    } catch (e) {
      summary.errors.push(`row ${row.rowNumber}: ${(e as Error).message}`);
    }
  }

  // 3) DELIVERY — messages WATI accepted and Meta then refused.
  //
  // Runs last, and only reports. Acceptance is not delivery: reminders_sent is
  // written when WATI returns 200, so a message Meta drops afterwards reads as
  // delivered forever. Naming those people is the difference between a reminder
  // that quietly did not arrive and one somebody can act on.
  //
  // OPT-IN (switches.deliveryCheck, default OFF): this polls WATI's read API up
  // to ~26 times per tick, which is what tripped the WATI usage limit (429)
  // during a live blast. Skipped unless explicitly enabled from the control tab.
  //
  // Never allowed to sink the tick — a delivery check that breaks the campaign
  // is worse than one that does not run.
  if (switches.deliveryCheck) {
    try {
      const d = await checkWhatsAppDelivery(auto);
      summary.deliveryFailed = d.failed;
      if (!d.available) summary.errors.push("delivery check: WATI contacts/messages not readable");
    } catch (e) {
      summary.errors.push(`delivery check: ${(e as Error).message}`);
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
  await loadTabOverrides();
  // The pass is regenerated on every download, so it must be stamped with THIS
  // campaign's event — not config.ts's defaults, which are whatever the last
  // campaign left behind. An attendee re-opening their pass link would otherwise
  // be handed a PDF for the previous workshop.
  const [c, auto] = await Promise.all([loadCampaign(), readTable(env.autoTab())]);
  const row = auto.rows.find((r) => cell(auto, r, A.token) === token);
  if (!row) return null;
  const regId = cell(auto, row, A.regId);
  if (!regId) return null;
  const name = cell(auto, row, A.name) || "Guest";
  const company = cell(auto, row, A.company);
  const bytes = await generatePass(passDataFor(c, name, company, regId));
  return { bytes, filename: `Event_Pass_${firstNameOf(name)}.pdf` };
}

export interface OptOutResult {
  ok: boolean;
  found: boolean;
  name?: string;
  reason?: LeadStatus;
  alreadyOut?: boolean;
}

// Set (or clear) a lead's opt-out. Locked because it is a read-modify-write on the
// same tab the tick and registration touch. Idempotent: opting out an already-out
// lead is a no-op that still reports success.
export async function setOptOut(
  match: { token?: string; phoneKey?: string; email?: string },
  reason: LeadStatus,
  source: StatusSource = STATUS_SOURCE.reply,
  replyText?: string,
): Promise<OptOutResult> {
  await loadTabOverrides(); // cheap TTL no-op when called mid-tick; correct when called from a webhook
  return withSheetLock("setOptOut", async () => {
    const auto = await readTable(env.autoTab());
    const em = match.email?.trim().toLowerCase();
    // Token first (unambiguous), then phone, then email. Email is last because
    // it is the weakest key: shared company mailboxes mean one address can cover
    // two people, so it is only used when nothing better identifies them.
    const row =
      (match.token ? auto.rows.find((r) => cell(auto, r, A.token) === match.token) : undefined) ??
      (match.phoneKey
        ? auto.rows.find((r) => cell(auto, r, A.phoneKey) === match.phoneKey)
        : undefined) ??
      (em
        ? auto.rows.find((r) => cell(auto, r, A.email).trim().toLowerCase() === em)
        : undefined);
    if (!row) return { ok: true, found: false };

    const name = cell(auto, row, A.name) || "there";
    const current = cell(auto, row, A.status).trim();
    // Never downgrade a hard unsubscribe to a soft reply: someone who opted out
    // fully and then sends another message must stay fully out.
    // Never soften an existing stop — see RANK in config.ts.
    if (!outranks(reason, current)) {
      return { ok: true, found: true, name, reason: reason, alreadyOut: true };
    }
    if (current === reason) return { ok: true, found: true, name, reason, alreadyOut: true };

    const fields: Record<string, string> = {
      [A.status]: reason,
      [A.statusAt]: nowIso(),
      [A.statusSource]: source,
    };
    if (replyText) {
      fields[A.lastReply] = replyText.replace(/\s+/g, " ").trim().slice(0, 300);
      fields[A.lastReplyAt] = nowIso();
    }
    await updateRow(auto, row.rowNumber, fields);
    return { ok: true, found: true, name, reason };
  }, env.sheetId());
}

// Clear a lead's opt-out (resubscribe). Reminders they are still eligible for
// resume on the next tick — dueReminders' window means only the ones still ahead
// of the workshop fire, not a stacked burst of stale ones.
export async function clearOptOut(token: string): Promise<OptOutResult> {
  await loadTabOverrides();
  return withSheetLock("clearOptOut", async () => {
    const auto = await readTable(env.autoTab());
    const row = auto.rows.find((r) => cell(auto, r, A.token) === token);
    if (!row) return { ok: true, found: false };
    const name = cell(auto, row, A.name) || "there";
    if (!cell(auto, row, A.status)) return { ok: true, found: true, name }; // already subscribed
    await updateRow(auto, row.rowNumber, {
      [A.status]: "",
      [A.statusAt]: "",
      [A.statusSource]: "",
    });
    return { ok: true, found: true, name };
  }, env.sheetId());
}

export function optOutStateForToken(auto: Table, token: string): {
  found: boolean;
  name?: string;
  status?: string;
} {
  const row = auto.rows.find((r) => cell(auto, r, A.token) === token);
  if (!row) return { found: false };
  return { found: true, name: cell(auto, row, A.name) || "there", status: cell(auto, row, A.status) };
}

// Retire rows that are the same person as another row, keyed on phone number.
// Backstop for read-modify-write races (a form ingest and a registration landing
// milliseconds apart both appended). Keeps the registered row if there is one,
// else the oldest, and marks the rest opted_out=duplicate so the gate skips them.
// Never deletes — retiring keeps the lead_id in knownIds so nothing re-ingests.
export async function reconcileDuplicates(): Promise<{ retired: number; groups: number }> {
  await loadTabOverrides();
  return withSheetLock("reconcileDuplicates", async () => {
    const auto = await readTable(env.autoTab());

    // Rows still in play. A dead channel does NOT take a row out of contention —
    // it may still be messaged on the other one, so it can still be half of a
    // double-messaging pair. Only intent (opted_out) retires a row.
    // A row with a dead channel is still in play — it may be messaged on the
    // other one, so it can still be half of a double-messaging pair. Only a full
    // stop takes a row out of contention.
    const active = auto.rows.filter((r) => {
      const p = policyFor(cell(auto, r, A.status));
      return p.nurture || p.reminders;
    });

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
          [A.status]: STATUS.duplicate,
          [A.statusAt]: nowIso(),
          [A.statusSource]: STATUS_SOURCE.reconcile,
        });
        retired++;
      }
    }
    return { retired, groups };
  }, env.sheetId());
}
