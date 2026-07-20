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

import { env } from "./env";
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
  available: boolean; // false when Mail.Read is not granted
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

export async function pollMailReplies(): Promise<PollResult> {
  const upn = env.graphSender();
  const ownDomains = ["@diacto.com", "@salesup.club"];

  const stored = await readSetting(LAST_CHECK_KEY);
  const since =
    stored && !Number.isNaN(Date.parse(stored))
      ? stored
      : new Date(Date.now() - COLD_START_HOURS * 3_600_000).toISOString();

  const result: PollResult = {
    scanned: 0,
    humanReplies: 0,
    optedOut: 0,
    unmatched: [],
    skipped: { machine: 0, internal: 0 },
    since,
    available: true,
  };

  // Graph wants the filter timestamp without milliseconds.
  const sinceParam = new Date(since).toISOString().replace(/\.\d+Z$/, "Z");
  const page = await graphGet<{ value: GraphMessage[] }>(
    `/users/${encodeURIComponent(upn)}/mailFolders/inbox/messages` +
      `?$top=100&$orderby=receivedDateTime desc` +
      `&$filter=receivedDateTime gt ${sinceParam}` +
      `&$select=id,receivedDateTime,subject,bodyPreview,from`,
  );

  // Null means Mail.Read isn't granted. Say so once and carry on — the rest of
  // the tick is unaffected, and opt-outs can still be typed into the sheet.
  if (page === null) {
    result.available = false;
    return result;
  }

  const messages = page.value || [];
  result.scanned = messages.length;

  messages.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));

  // Aggregate per person before acting. Someone who writes three times is one
  // opt-out, not three, and if any of those messages was an explicit
  // unsubscribe that is the reason we record — taking whichever arrived first
  // would let a later "thanks" soften a real opt-out request.
  const byPerson = new Map<string, { latest: GraphMessage; reason: LeadStatus }>();
  for (const m of messages) {
    const addr = (m.from?.emailAddress?.address || "").toLowerCase();
    if (!isHumanReply(m, ownDomains)) {
      if (ownDomains.some((d) => addr.endsWith(d))) result.skipped.internal++;
      else result.skipped.machine++;
      continue;
    }
    result.humanReplies++;
    const reason = classifyReply(m.subject || "", m.bodyPreview || "");
    const prev = byPerson.get(addr);
    byPerson.set(addr, {
      latest: m, // messages are in ascending order, so this ends up the newest
      reason: prev?.reason === STATUS.unsubscribed ? STATUS.unsubscribed : reason,
    });
  }

  // Replies that matched nothing this pass. Parked below rather than dropped.
  const freshUnmatched: Pending[] = [];

  for (const [addr, { latest: m, reason }] of Array.from(byPerson.entries())) {
    try {
      const text = `${m.subject || ""} — ${m.bodyPreview || ""}`;
      const out = await setOptOut(
        { email: addr },
        reason,
        reason === STATUS.unsubscribed
          ? STATUS_SOURCE.unsubscribe_link
          : STATUS_SOURCE.reply,
        // Kept so a caller can see what the person actually said, rather than
        // only that "something" arrived.
        text,
      );
      if (!out.found) {
        result.unmatched.push(addr);
        freshUnmatched.push({ addr, at: m.receivedDateTime, reason, text });
        continue;
      }
      if (out.alreadyOut) continue; // already stopped; don't re-announce
      result.optedOut++;
      await notifySlack(
        `:no_entry_sign: *${out.name || addr} replied — all messaging stopped* (${reason})\n` +
          `> ${(m.subject || "").slice(0, 120)}\n` +
          (m.bodyPreview ? `> ${m.bodyPreview.replace(/\s+/g, " ").slice(0, 200)}\n` : "") +
          `They will get no further follow-ups or reminders. Someone should reply to them personally.`,
      );
    } catch (e) {
      console.error(`[mailReplies] ${addr}:`, e);
    }
  }

  // Retry everything parked on an earlier pass. The usual reason one of these
  // starts matching is that the row it belongs to got its contact details back,
  // which is exactly the case that used to be unrecoverable.
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

  // Announce only the ones seen for the first time, so a parked address does not
  // put the same line in Slack every five minutes.
  if (freshUnmatched.length) {
    await notifySlack(
      `:mag: ${freshUnmatched.length} reply/replies from address(es) not in the sheet: ` +
        `${freshUnmatched.map((f) => f.addr).slice(0, 5).join(", ")}${freshUnmatched.length > 5 ? "…" : ""}. ` +
        `Nothing was stopped for them yet — they will be retried for ${UNMATCHED_TTL_HOURS}h ` +
        `in case the row is missing its contact details.`,
    );
  }

  // Only write when it actually changed. This runs every tick, and an
  // unconditional write would be a Sheets call every five minutes forever just
  // to store the same empty string.
  const nextPending = encodePending([...stillPending, ...freshUnmatched]);
  if (nextPending !== (parkedRaw ?? "")) await writeSetting(PENDING_KEY, nextPending);

  // Safe to advance now: anything this pass could not apply has been parked
  // above, so moving past it no longer loses it. The filter is `gt`, so a
  // watermark that ran ahead of an unapplied message used to make that message
  // permanently unreadable.
  const newest = messages.length ? messages[messages.length - 1].receivedDateTime : null;
  if (newest) await writeSetting(LAST_CHECK_KEY, newest);

  return result;
}
