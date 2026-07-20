// Turn a bounce into a decision, or deliberately into nothing.
//
// Until now every non-delivery report was filtered as machine noise and dropped.
// That meant a mailbox that no longer exists kept being emailed on every send —
// which is one of the ways a sender's reputation is destroyed.
//
// The reason it was never "just mark them bounced" is that bounces do not all
// mean the same thing, and acting on the wrong ones is worse than acting on
// none. The enhanced status code says which is which:
//
//   5.1.x  THEIR mailbox is gone (user unknown, no such recipient).
//          Suppress email for that address. This is the only class we act on.
//   5.7.x  OUR side was refused — policy, relay, authentication, reputation.
//          Never suppress. On 20 July every message came back 5.7.708 because
//          Microsoft was blocking the new tenant's outbound IP: acting on those
//          would have flagged all 269 leads as having a dead mailbox, from a
//          fault that was entirely ours.
//   5.2.x / 5.3.x  mailbox full, message too large — theirs, but not permanent.
//   4.x.x  temporary. The sending server retries by itself; we do nothing.
//
// Recipients are identified by matching addresses found anywhere in the report
// against the sheet, rather than by parsing a position in the text. NDR layout
// varies by provider; "an address we are actually mailing" does not.

import { STATUS, STATUS_SOURCE } from "./config";
import { setOptOut } from "./service";
import { notifySlack } from "./slack";
import { cell, Table } from "./google";

/** Subjects that mean "a mail system is telling you a message failed". */
const BOUNCE_SUBJECT =
  /^(undeliverable|delivery (has failed|status notification)|returned mail|mail delivery (failed|subsystem)|failure notice)/i;

export const isBounceSubject = (subject: string) => BOUNCE_SUBJECT.test((subject || "").trim());

export type BounceKind = "recipient_dead" | "sender_blocked" | "other_permanent" | "transient";

/**
 * What does this status code mean for us?
 *
 * Unrecognised or absent codes are "other_permanent" — reported, never acted on.
 * Guessing at a code we do not understand is exactly the mistake this avoids.
 */
export function classifyCode(code: string): BounceKind {
  if (/^4\./.test(code)) return "transient";
  if (/^5\.1\./.test(code)) return "recipient_dead";
  if (/^5\.7\./.test(code)) return "sender_blocked";
  return "other_permanent";
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CODE_RE = /\b([45]\.\d{1,3}\.\d{1,3})\b/g;

export interface ParsedBounce {
  codes: string[];
  addresses: string[];
  kind: BounceKind;
}

/**
 * Pull the status codes and candidate addresses out of a report body.
 *
 * The strongest code wins when a report carries several — a 5.x alongside a
 * 4.x is a permanent failure that was retried, not a temporary one.
 */
export function parseBounce(body: string, ownDomains: string[]): ParsedBounce {
  const text = String(body || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");

  const codes = Array.from(new Set(text.match(CODE_RE) ?? []));
  const addresses = Array.from(new Set(text.match(EMAIL_RE) ?? []))
    .map((a) => a.toLowerCase())
    .filter((a) => !ownDomains.some((d) => a.endsWith(d)))
    // Exchange puts its own server names in the report; they are not people.
    .filter((a) => !/\.(prod|protection)\.outlook\.com$/i.test(a));

  const kinds = codes.map(classifyCode);
  const kind: BounceKind = kinds.includes("recipient_dead")
    ? "recipient_dead"
    : kinds.includes("sender_blocked")
      ? "sender_blocked"
      : kinds.includes("other_permanent")
        ? "other_permanent"
        : kinds.includes("transient")
          ? "transient"
          : "other_permanent";

  return { codes, addresses, kind };
}

export interface BounceOutcome {
  seen: number;
  suppressed: string[]; // addresses marked email_bounced
  senderBlocked: string[]; // codes indicating OUR relay was refused
  ignored: number;
}

/**
 * Apply a batch of parsed reports.
 *
 * Only addresses that exist in the sheet are touched — a bounce for something
 * we never sent is somebody else's problem. setOptOut refuses to downgrade a
 * stronger status, so an unsubscribe is never softened into a bounce.
 */
export async function applyBounces(
  reports: { subject: string; body: string }[],
  auto: Table,
  ownDomains: string[],
): Promise<BounceOutcome> {
  const out: BounceOutcome = { seen: 0, suppressed: [], senderBlocked: [], ignored: 0 };
  const known = new Set(
    auto.rows.map((r) => cell(auto, r, "email").trim().toLowerCase()).filter(Boolean),
  );

  for (const rep of reports) {
    out.seen++;
    const p = parseBounce(rep.body, ownDomains);

    if (p.kind !== "recipient_dead") {
      if (p.kind === "sender_blocked") out.senderBlocked.push(...p.codes);
      out.ignored++;
      continue;
    }

    const targets = p.addresses.filter((a) => known.has(a));
    for (const addr of targets) {
      try {
        const res = await setOptOut(
          { email: addr },
          STATUS.email_bounced,
          STATUS_SOURCE.bounce,
          `Mailbox rejected us: ${p.codes.join(", ")}`,
        );
        if (res.found && !res.alreadyOut) out.suppressed.push(addr);
      } catch (e) {
        console.error(`[bounces] ${addr}:`, e);
      }
    }
  }

  if (out.suppressed.length) {
    await notifySlack(
      `:mailbox_with_no_mail: *${out.suppressed.length} mailbox(es) marked dead* — ` +
        `${out.suppressed.slice(0, 6).join(", ")}${out.suppressed.length > 6 ? "…" : ""}. ` +
        `Email is off for them; WhatsApp and event-day reminders continue.`,
    );
  }

  // Said once per tick, not per message: a relay block produces one report per
  // recipient, and 48 identical Slack lines would bury the one thing that matters.
  if (out.senderBlocked.length) {
    const codes = Array.from(new Set(out.senderBlocked));
    await notifySlack(
      `:rotating_light: *Our mail is being refused before it reaches anyone* (${codes.join(", ")}). ` +
        `${out.senderBlocked.length} report(s) this tick. Nobody has been marked bounced — this is a ` +
        `sending-side block, not their mailboxes. Email will keep failing until it is lifted.`,
    );
  }

  return out;
}
