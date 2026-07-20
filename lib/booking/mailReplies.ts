// Watch workshop@diacto.com for replies, and stop chasing anyone who answers.
//
// Until 18 July 2026 the Graph app could only send, so an email reply was
// invisible to this system. That mattered more than it sounds: the unsubscribe
// link at the bottom of every message was
//   mailto:workshop@diacto.com?subject=Unsubscribe - Workshop
// so the ONLY way anyone could opt out was to send mail to an inbox nothing was
// reading. One man used it seven times over two days and received 36 more emails.
//
// With Mail.Read granted, that link finally does something. Replies are matched
// back to a lead and turned into an opt-out on the next tick.
//
// The bar for stopping is deliberately low. Anything a human types back — "not
// interested", "please send the deck", a bare "unsubscribe" — stops the chasing,
// because a person who has answered should be handled by a person, not nudged
// again by a scheduler. What must NOT trigger it is machine noise: bounces and
// out-of-office autoreplies are not the lead talking, and treating them as
// opt-outs would silently drop real prospects.

import { env, Mailbox } from "./env";
import { graphGet } from "./graph";
import { setOptOut } from "./service";
import { notifySlack } from "./slack";
import { readSetting, writeSetting } from "./control";
import { STATUS, STATUS_SOURCE, LeadStatus, STOP_WORDS } from "./config";

const LAST_CHECK_KEY = "mail_last_checked";

// How far back to look on the very first run. Long enough to catch the current
// campaign's replies, short enough not to re-process ancient history.
const COLD_START_HOURS = 72;

// Replies we could not match to a row, parked so they are not lost.
//
// The watermark advances on the newest message SCANNED, which used to mean an
// unmatched reply was consumed and gone: the filter below is `gt`, so it is
// never read a second time. That is how an "Unsubscribe - Workshop" mail sent on
// 18 July was dropped — the sender's row had a blank email cell, nothing matched,
// and the watermark moved past it anyway. A consent request is the last thing
// this system should lose silently.
//
// Holding the watermark back instead would fix that case and break a worse one:
// mail from someone genuinely not in the sheet never matches, so the poll would
// re-read and re-announce it every five minutes forever. Parking the address
// keeps both properties — nothing is lost, nothing repeats.
const PENDING_KEY = "mail_unmatched";

// How long to keep retrying. Long enough for a blank contact column to be
// restored by hand; short enough that a stranger's mail stops being retried.
const UNMATCHED_TTL_HOURS = 72;

interface Pending {
  addr: string;
  at: string; // receivedDateTime of the message
  reason: LeadStatus;
  text: string;
}

// One line per address, fields pipe-separated, the reply text percent-encoded so
// it cannot smuggle a delimiter or a newline into the cell.
function encodePending(list: Pending[]): string {
  return list
    .map((p) => [p.addr, p.at, p.reason, encodeURIComponent(p.text || "")].join("|"))
    .join("\n");
}

function decodePending(raw: string | null): Pending[] {
  if (!raw) return [];
  const out: Pending[] = [];
  for (const line of raw.split("\n")) {
    const [addr, at, reason, text] = line.split("|");
    if (!addr || !at) continue;
    let decoded = "";
    try {
      decoded = decodeURIComponent(text || "");
    } catch {
      decoded = text || ""; // a hand-edited cell must not break the poll
    }
    out.push({ addr, at, reason: (reason as LeadStatus) || STATUS.replied, text: decoded });
  }
  return out;
}

interface GraphMessage {
  id: string;
  receivedDateTime: string;
  subject?: string;
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
}

// Senders that are systems, not people.
const MACHINE_SENDER =
  /^(mailer-daemon|postmaster|no-?reply|donotreply|bounce|notifications?|microsoftexchange[0-9a-f]+|microsoft365)@/i;

// Bulk senders whose mail lands in this inbox but is nobody replying to us.
// Without this, Microsoft's own product marketing reads as a lead reply — it
// matches no row so nothing would be silenced, but it puts noise in Slack.
const MACHINE_DOMAIN =
  /@(communication\.microsoft\.com|email\.microsoft\.com|.*\.mail\.google\.com|bounces?\..*)$/i;

// Subjects that mean "a mail server is talking to you".
const MACHINE_SUBJECT =
  /^(undeliverable|delivery (has failed|status notification)|returned mail|mail delivery|automatic reply|auto-?reply|autoresponse|out of office)/i;

export interface ReplyOutcome {
  address: string;
  reason: LeadStatus;
  matched: boolean;
  name?: string;
}

export interface PollResult {
  scanned: number;
  humanReplies: number;
  optedOut: number;
  unmatched: string[]; // replies from addresses not in the sheet
  skipped: { machine: number; internal: number };
  since: string;
  available: boolean; // false when NO mailbox could be read
  /** One entry per watched mailbox, so a dead one is visible rather than silent. */
  boxes: MailboxOutcome[];
}

/** Is this message a human replying, rather than a mail system? */
export function isHumanReply(m: GraphMessage, ownDomains: string[]): boolean {
  const addr = (m.from?.emailAddress?.address || "").toLowerCase();
  if (!addr) return false;
  if (MACHINE_SENDER.test(addr)) return false;
  if (MACHINE_DOMAIN.test(addr)) return false;
  if (MACHINE_SUBJECT.test(m.subject || "")) return false;
  // Our own people talking to the mailbox aren't leads.
  if (ownDomains.some((d) => addr.endsWith(d))) return false;
  return true;
}

/**
 * Unsubscribe, or just a reply?
 *
 * The distinction is recorded for audit only — both stop everything — so it is
 * fine for it to be approximate. It leans towards "unsubscribe" when the person
 * clearly asked to be removed, since that reads better in the sheet and in any
 * later conversation about what we did.
 */
export function classifyReply(subject: string, body: string): LeadStatus {
  const s = (subject || "").toLowerCase();
  // The mailto: link in every email pre-fills exactly this subject, so it is a
  // deliberate opt-out no matter what the body says.
  if (s.includes("unsubscribe")) return STATUS.unsubscribed;

  const text = (body || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (STOP_WORDS.some((w) => text === w || text.startsWith(w + " ") || text.includes(` ${w} `))) {
    return STATUS.unsubscribed;
  }
  return STATUS.replied;
}

/** Per-mailbox watermark. The first keeps the original key so the live value survives. */
const lastCheckKey = (idx: number) => (idx === 0 ? LAST_CHECK_KEY : `${LAST_CHECK_KEY}_${idx + 1}`);

export interface MailboxOutcome {
  upn: string;
  available: boolean;
  scanned: number;
  error?: string;
}

/**
 * Read one inbox and act on it.
 *
 * Deliberately does NOT touch the parked list: retrying a parked reply is a
 * sheet operation that has nothing to do with Graph, so it belongs outside the
 * per-mailbox loop. Keeping it there is what lets a parked reply still be
 * applied after the mailbox it arrived in has been deleted.
 */
async function pollOne(
  box: Mailbox,
  idx: number,
  ownDomains: string[],
): Promise<{
  scanned: number;
  humanReplies: number;
  optedOut: number;
  skipped: { machine: number; internal: number };
  unmatched: string[];
  fresh: Pending[];
  since: string;
  available: boolean;
}> {
  const stored = await readSetting(lastCheckKey(idx));
  const since =
    stored && !Number.isNaN(Date.parse(stored))
      ? stored
      : new Date(Date.now() - COLD_START_HOURS * 3_600_000).toISOString();

  const out = {
    scanned: 0,
    humanReplies: 0,
    optedOut: 0,
    skipped: { machine: 0, internal: 0 },
    unmatched: [] as string[],
    fresh: [] as Pending[],
    since,
    available: true,
  };

  // Graph wants the filter timestamp without milliseconds.
  const sinceParam = new Date(since).toISOString().replace(/\.\d+Z$/, "Z");
  const page = await graphGet<{ value: GraphMessage[] }>(
    `/users/${encodeURIComponent(box.upn)}/mailFolders/inbox/messages` +
      `?$top=100&$orderby=receivedDateTime desc` +
      `&$filter=receivedDateTime gt ${sinceParam}` +
      `&$select=id,receivedDateTime,subject,bodyPreview,from`,
    box,
  );

  // Null means this mailbox cannot be read: consent revoked, or the mailbox
  // itself deleted. Either way the OTHER mailboxes and the rest of the tick are
  // unaffected, and opt-outs can still be typed into the sheet.
  if (page === null) {
    out.available = false;
    return out;
  }

  const messages = page.value || [];
  out.scanned = messages.length;
  messages.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));

  // Aggregate per person before acting. Someone who writes three times is one
  // opt-out, not three, and if any of those messages was an explicit
  // unsubscribe that is the reason we record — taking whichever arrived first
  // would let a later "thanks" soften a real opt-out request.
  const byPerson = new Map<string, { latest: GraphMessage; reason: LeadStatus }>();
  for (const m of messages) {
    const addr = (m.from?.emailAddress?.address || "").toLowerCase();
    if (!isHumanReply(m, ownDomains)) {
      if (ownDomains.some((d) => addr.endsWith(d))) out.skipped.internal++;
      else out.skipped.machine++;
      continue;
    }
    out.humanReplies++;
    const reason = classifyReply(m.subject || "", m.bodyPreview || "");
    const prev = byPerson.get(addr);
    byPerson.set(addr, {
      latest: m, // messages are in ascending order, so this ends up the newest
      reason: prev?.reason === STATUS.unsubscribed ? STATUS.unsubscribed : reason,
    });
  }

  for (const [addr, { latest: m, reason }] of Array.from(byPerson.entries())) {
    try {
      const text = `${m.subject || ""} — ${m.bodyPreview || ""}`;
      const res = await setOptOut(
        { email: addr },
        reason,
        reason === STATUS.unsubscribed ? STATUS_SOURCE.unsubscribe_link : STATUS_SOURCE.reply,
        // Kept so a caller can see what the person actually said, rather than
        // only that "something" arrived.
        text,
      );
      if (!res.found) {
        out.unmatched.push(addr);
        out.fresh.push({ addr, at: m.receivedDateTime, reason, text });
        continue;
      }
      if (res.alreadyOut) continue; // already stopped; don't re-announce
      out.optedOut++;
      await notifySlack(
        `:no_entry_sign: *${res.name || addr} replied — all messaging stopped* (${reason})\n` +
          `> ${(m.subject || "").slice(0, 120)}\n` +
          (m.bodyPreview ? `> ${m.bodyPreview.replace(/\s+/g, " ").slice(0, 200)}\n` : "") +
          `They will get no further follow-ups or reminders. Someone should reply to them personally.`,
      );
    } catch (e) {
      console.error(`[mailReplies] ${box.upn} ${addr}:`, e);
    }
  }

  // Advance the watermark, and GUARANTEE it moves.
  //
  // Graph keeps sub-second precision internally but only renders whole seconds
  // in receivedDateTime. Storing what we were shown and filtering `gt` on it
  // therefore re-matches the same message every pass: 16:16:58Z is not greater
  // than 16:16:58.472Z. That is not theoretical — one unsubscribe sat in this
  // loop from 18 July, re-read and re-announced every five minutes, and the
  // watermark could never get past it.
  //
  // So when the newest message is not strictly ahead of where we started, step
  // one second beyond `since` instead. The cost is that a message arriving in
  // that same second could be skipped; the alternative is a poll that can never
  // move on, which is strictly worse.
  const newest = messages.length ? messages[messages.length - 1].receivedDateTime : null;
  if (newest) {
    const newestMs = Date.parse(newest);
    const sinceMs = Date.parse(since);
    const next =
      Number.isFinite(newestMs) && newestMs > sinceMs
        ? newest
        : new Date(sinceMs + 1000).toISOString();
    await writeSetting(lastCheckKey(idx), next);
  }

  return out;
}

export async function pollMailReplies(): Promise<PollResult> {
  let boxes: Mailbox[];
  try {
    boxes = env.mailboxes();
  } catch (e) {
    // A half-configured second tenant. Loud, and then carry on with the primary
    // rather than leaving every inbox unread.
    await notifySlack(`:warning: Mailbox config problem — ${(e as Error).message}`);
    boxes = [
      {
        upn: env.graphSender(),
        tenantId: env.azureTenantId(),
        clientId: env.azureClientId(),
        clientSecret: env.azureClientSecret(),
      },
    ];
  }

  // Our own people talking to a workshop mailbox are not leads. Derived from the
  // mailboxes themselves so adding one in a new domain cannot silently turn our
  // own staff into opt-outs.
  const ownDomains = Array.from(
    new Set(
      boxes
        .map((b) => "@" + (b.upn.split("@")[1] || "").toLowerCase())
        .filter((d) => d.length > 1)
        .concat("@salesup.club"),
    ),
  );

  const result: PollResult = {
    scanned: 0,
    humanReplies: 0,
    optedOut: 0,
    unmatched: [],
    skipped: { machine: 0, internal: 0 },
    since: "",
    available: false,
    boxes: [],
  };

  const freshUnmatched: Pending[] = [];

  for (const [idx, box] of Array.from(boxes.entries())) {
    // Each mailbox is isolated. One being deleted, or its consent pulled, must
    // not stop the others being read — that would turn a single revoked grant
    // into total silence on every channel we listen to.
    try {
      const r = await pollOne(box, idx, ownDomains);
      result.scanned += r.scanned;
      result.humanReplies += r.humanReplies;
      result.optedOut += r.optedOut;
      result.skipped.machine += r.skipped.machine;
      result.skipped.internal += r.skipped.internal;
      result.unmatched.push(...r.unmatched);
      freshUnmatched.push(...r.fresh);
      if (idx === 0) result.since = r.since;
      if (r.available) result.available = true;
      result.boxes.push({ upn: box.upn, available: r.available, scanned: r.scanned });
    } catch (e) {
      const why = (e as Error).message;
      console.error(`[mailReplies] ${box.upn} unreadable:`, e);
      result.boxes.push({ upn: box.upn, available: false, scanned: 0, error: why });
    }
  }

  // Retry everything parked on an earlier pass. ONE shared list, deliberately:
  // this only reads and writes the sheet, so it must keep working for a reply
  // whose mailbox has since been deleted. The usual reason one starts matching
  // is that the row it belongs to got its contact details back.
  const parkedRaw = await readSetting(PENDING_KEY);
  const parked = decodePending(parkedRaw);
  const cutoff = Date.now() - UNMATCHED_TTL_HOURS * 3_600_000;
  const stillPending: Pending[] = [];
  const expired: string[] = [];

  for (const p of parked) {
    // Anything re-reported by this pass is handled by freshUnmatched below.
    if (freshUnmatched.some((f) => f.addr === p.addr)) continue;
    try {
      const out = await setOptOut(
        { email: p.addr },
        p.reason,
        p.reason === STATUS.unsubscribed ? STATUS_SOURCE.unsubscribe_link : STATUS_SOURCE.reply,
        p.text,
      );
      if (out.found) {
        if (!out.alreadyOut) {
          result.optedOut++;
          await notifySlack(
            `:no_entry_sign: *${out.name || p.addr} replied — all messaging stopped* (${p.reason})\n` +
              `> ${p.text.slice(0, 200)}\n` +
              `This reply arrived ${p.at.slice(0, 16)} and could not be matched to a row at the time. ` +
              `It has been applied now.`,
          );
        }
        continue; // matched — drop it from the list
      }
    } catch (e) {
      console.error(`[mailReplies] retry ${p.addr}:`, e);
      stillPending.push(p); // a transient failure must not discard the reply
      continue;
    }
    if (Date.parse(p.at) < cutoff) expired.push(p.addr);
    else stillPending.push(p);
  }

  if (expired.length) {
    await notifySlack(
      `:hourglass: Gave up matching ${expired.length} reply/replies after ${UNMATCHED_TTL_HOURS}h: ` +
        `${expired.slice(0, 5).join(", ")}${expired.length > 5 ? "…" : ""}. ` +
        `They were never found in the sheet — if any of them is a real lead, stop them by hand.`,
    );
  }

  // Announce only addresses never parked before.
  //
  // "Fresh" cannot mean "unmatched on this pass": a message the inbox keeps
  // handing back is unmatched on EVERY pass, which is precisely how one
  // unsubscribe put the same line in Slack every five minutes for two days.
  // Checking against what is already parked is what makes the notice once-only,
  // independent of whether the read side ever repeats itself.
  const known = new Set(parked.map((p) => p.addr));
  const firstSeen = freshUnmatched.filter((f) => !known.has(f.addr));
  if (firstSeen.length) {
    await notifySlack(
      `:mag: ${firstSeen.length} reply/replies from address(es) not in the sheet: ` +
        `${firstSeen.map((f) => f.addr).slice(0, 5).join(", ")}${firstSeen.length > 5 ? "…" : ""}. ` +
        `Nothing was stopped for them yet — they will be retried for ${UNMATCHED_TTL_HOURS}h ` +
        `in case the row is missing its contact details.`,
    );
  }

  // Only write when it actually changed. This runs every tick, and an
  // unconditional write would be a Sheets call every five minutes forever just
  // to store the same empty string.
  const nextPending = encodePending([...stillPending, ...freshUnmatched]);
  if (nextPending !== (parkedRaw ?? "")) await writeSetting(PENDING_KEY, nextPending);

  const dead = result.boxes.filter((b: MailboxOutcome) => !b.available);
  if (dead.length === result.boxes.length) result.available = false;

  return result;
}
