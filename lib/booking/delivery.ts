// Did the message actually arrive?
//
// WATI returns 200 the moment it ACCEPTS a message. Meta decides whether to
// deliver it afterwards, and that verdict never comes back to us. So the tick
// writes "sent" into reminders_sent on acceptance, and a message Meta later
// drops is indistinguishable from one that was read.
//
// That is tolerable for a nudge and not tolerable for a reminder. On 20 July the
// number was quality-restricted and roughly a third of sends came back FAILED —
// at that rate about a third of registered attendees would be recorded as
// reminded while receiving nothing, with no retry, because dueReminders never
// returns a key it has already seen.
//
// This REPORTS rather than retries, deliberately:
//   * The failures are a Meta quality restriction ("retry again in a few days").
//     Automatically resending into that makes the rating worse, not better.
//   * Un-claiming a reminder to force a retry risks double-sending to everyone
//     it misidentifies, and being wrong here means messaging people twice.
//   * The registered list is small enough that a named Slack alert lets a human
//     act with better judgement than a scheduler has.
//
// Each failure is announced once. Repeating it every five minutes would bury it.

import { readTable, cell, Table } from "./google";
import { env } from "./env";
import { notifySlack } from "./slack";
import { readSetting, writeSetting } from "./control";

const ALERTED_KEY = "wa_delivery_alerted";

// How far back a failure is still worth reporting. Longer than the tick interval
// so nothing is missed between runs, short enough that a restart does not replay
// yesterday's problems.
const WINDOW_HOURS = 6;

// Entries older than this drop out of the alerted list, which otherwise grows
// forever. Comfortably beyond WINDOW_HOURS so nothing is re-announced.
const ALERTED_TTL_HOURS = 48;

// Contacts examined per tick. The contact list comes back newest-first, so this
// covers everyone touched recently without spending the whole time budget on
// people nobody has messaged.
const MAX_CONTACTS = 25;

export interface DeliveryReport {
  available: boolean;
  checked: number;
  failed: number;
  registeredFailed: number;
  announced: number;
}

interface WatiMessage {
  eventType?: string;
  owner?: boolean;
  created?: string;
  statusString?: string;
  templateId?: string;
  text?: string;
}

const isFailure = (s?: string) => /fail|undeliver/i.test(String(s || ""));

async function wati<T>(path: string): Promise<T | null> {
  const token = env.watiToken();
  const r = await fetch(`${env.watiEndpoint()}${path}`, {
    headers: { Authorization: token.startsWith("Bearer") ? token : `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return (await r.json()) as T;
}

function decodeAlerted(raw: string | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of (raw || "").split("\n")) {
    const [k, at] = line.split("|");
    if (k && at) m.set(k, at);
  }
  return m;
}

const encodeAlerted = (m: Map<string, string>) =>
  Array.from(m.entries())
    .map(([k, at]) => `${k}|${at}`)
    .join("\n");

/**
 * Look for messages Meta refused, and name the people they were meant for.
 *
 * Never throws into the tick: a delivery check that takes the campaign down is
 * worse than one that quietly does not run.
 */
export async function checkWhatsAppDelivery(known?: Table): Promise<DeliveryReport> {
  const out: DeliveryReport = {
    available: true,
    checked: 0,
    failed: 0,
    registeredFailed: 0,
    announced: 0,
  };

  const contacts = await wati<{ contact_list?: { wAid: string; phone: string }[] }>(
    `/api/v1/getContacts?pageSize=${MAX_CONTACTS}&pageNumber=1`,
  );
  // 403 means the key lacks contacts:read — the campaign is unaffected, we just
  // cannot see delivery. Say so once via the report, not by throwing.
  if (!contacts) {
    out.available = false;
    return out;
  }

  // Reuse the table the tick already read. A separate read here is a whole extra
  // Sheets round trip every five minutes for data we are only looking things up
  // in, and the read quota is not free — it is what this project trips first.
  // Slightly stale is fine: a row created this same tick is simply picked up on
  // the next one.
  const auto = known ?? (await readTable(env.autoTab()));
  const byKey = new Map(
    auto.rows.map((r) => [cell(auto, r, "phone_key"), r] as const),
  );

  const alertedRaw = await readSetting(ALERTED_KEY);
  const alerted = decodeAlerted(alertedRaw);
  const cutoff = Date.now() - WINDOW_HOURS * 3_600_000;
  const fresh: { name: string; phone: string; registered: boolean; reminder: string }[] = [];

  for (const c of contacts.contact_list ?? []) {
    const msgs = await wati<{ messages?: { items?: WatiMessage[] } }>(
      `/api/v1/getMessages/${encodeURIComponent(c.wAid)}?pageSize=6&pageNumber=1`,
    );
    if (!msgs) continue;
    out.checked++;

    const bad = (msgs.messages?.items ?? []).filter(
      (m) =>
        m.owner !== false && // not inbound
        isFailure(m.statusString) &&
        m.created &&
        Date.parse(m.created) >= cutoff,
    );
    if (!bad.length) continue;
    out.failed++;

    const key = String(c.phone || "").replace(/\D/g, "").slice(-10);
    const row = byKey.get(key);
    // Someone WATI knows and the sheet does not is not our problem to report.
    if (!row) continue;

    const newest = bad.sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
    // One entry per person per failure instant, so a second failure later still
    // gets announced but the same one never does twice.
    const dedupe = `${key}@${String(newest.created).slice(0, 16)}`;
    if (alerted.has(dedupe)) continue;
    alerted.set(dedupe, new Date().toISOString());

    const reminders = cell(auto, row, "reminders_sent");
    const registered =
      (cell(auto, row, "registration_complete") || "").trim().toUpperCase() === "TRUE";
    if (registered) out.registeredFailed++;
    fresh.push({
      name: cell(auto, row, "name") || key,
      phone: cell(auto, row, "phone") || key,
      registered,
      reminder: reminders,
    });
  }

  if (fresh.length) {
    const reg = fresh.filter((f) => f.registered);
    const rest = fresh.filter((f) => !f.registered);
    const lines: string[] = [];
    if (reg.length) {
      lines.push(
        `:rotating_light: *${reg.length} REGISTERED attendee(s) did not receive a WhatsApp message.*`,
        ...reg.map(
          (f) =>
            `• ${f.name} — ${f.phone}${f.reminder ? ` · marked as sent: ${f.reminder}` : ""}`,
        ),
        `The sheet records these as sent and will not retry them. Contact them directly.`,
      );
    }
    if (rest.length) {
      lines.push(
        `:warning: ${rest.length} other lead(s) also failed: ` +
          rest
            .slice(0, 5)
            .map((f) => f.name)
            .join(", ") +
          (rest.length > 5 ? "…" : ""),
      );
    }
    await notifySlack(lines.join("\n"));
    out.announced = fresh.length;
  }

  // Prune, then persist only if something changed — this runs every tick and an
  // unconditional write would be a Sheets call every five minutes for nothing.
  const ttl = Date.now() - ALERTED_TTL_HOURS * 3_600_000;
  for (const [k, at] of Array.from(alerted.entries())) {
    if (Date.parse(at) < ttl) alerted.delete(k);
  }
  const next = encodeAlerted(alerted);
  if (next !== (alertedRaw ?? "")) await writeSetting(ALERTED_KEY, next);

  return out;
}
