// Bring the calling team's dispositions into the automation tab.
//
// The callers work in their own tab, in their own words. Before this, the two
// systems never spoke: 71 people had been marked Junk or Not Interested by a
// human on the phone, and exactly 1 of them was actually suppressed. The rest
// were still queued for follow-ups, which is the worst kind of failure — a
// person told us to our face they weren't interested and we kept messaging them.
//
// ONE-WAY, always. This reads the Calling Sheet and never writes to it. That tab
// belongs to the callers; if the automation edited it we would be fighting them
// for the cursor, and a sync that can write both ways eventually writes the
// wrong way.
//
// The callers see our side without any write-back, because their tab is derived
// from the automation tab and carries the same columns. status, last_reply and
// last_reply_at therefore reach them the moment their sheet is refreshed — no
// mirroring, no second copy of the truth to keep aligned.
//
// Matching is on lead_id, which is Meta's and stable — all 134 calling rows
// matched an automation row on the first run. Phone and email are deliberately
// NOT used as fallbacks: a shared company mailbox or a mistyped number would
// silence the wrong person, and being wrong here means someone stops hearing
// from us entirely.

import { readTable, resolveHeader, cell } from "./google";
import { setOptOut } from "./service";
import { normalizeStatus, outranks, STATUS_SOURCE, LeadStatus } from "./config";
import { env } from "./env";

// Call outcomes, not lead states. "Connected" says someone picked up the phone;
// it says nothing about whether they want to hear from us again.
const NOT_A_DISPOSITION = /^(connected|not connected|follow ?up|)$/i;

export interface CallingSyncResult {
  available: boolean; // false when the tab is absent or unreadable
  scanned: number;
  matched: number;
  applied: number;
  skipped: number; // already at an equal or stronger status
  unmatched: number; // calling rows with no automation row
  error?: string; // set when the tab exists but could not be read this tick
}

export async function syncCallingDispositions(
  tabName = env.callingTab(),
): Promise<CallingSyncResult> {
  const result: CallingSyncResult = {
    available: true,
    scanned: 0,
    matched: 0,
    applied: 0,
    skipped: 0,
    unmatched: 0,
  };

  let call;
  try {
    call = await readTable(tabName);
  } catch (e) {
    result.available = false;
    // A missing tab is a normal state — staging has no calling sheet, and that
    // is fine. A rate limit or a server error is NOT, and swallowing it as "no
    // tab here" means dispositions stop syncing with nothing to show for it.
    // That is exactly how this looked when the read quota was exhausted: the
    // callers' Not Interested never reached the automation tab, silently.
    const status = Number((e as { status?: number; code?: number })?.status ?? (e as { code?: number })?.code);
    if (status === 429 || status === 503 || status >= 500) {
      result.error = `calling tab '${tabName}' unreadable (${status}) — dispositions not synced this tick`;
    }
    return result;
  }

  const cId = resolveHeader(call, ["lead_id", "id"]);
  const cSub = resolveHeader(call, ["sub_status", "substatus", "sub status"]);
  const cStatus = resolveHeader(call, ["status"]);
  if (!cId || (!cSub && !cStatus)) {
    result.available = false;
    return result;
  }

  const auto = await readTable(env.autoTab());
  const byId = new Map(
    auto.rows.map((r) => [cell(auto, r, "lead_id"), r] as const),
  );

  for (const row of call.rows) {
    const id = cell(call, row, cId).trim();
    if (!id) continue;
    result.scanned++;

    // Sub Status is the lead's state; Status is only a fallback for rows the
    // caller filled in more coarsely.
    const raw = (cSub ? cell(call, row, cSub).trim() : "") ||
      (cStatus ? cell(call, row, cStatus).trim() : "");
    if (NOT_A_DISPOSITION.test(raw)) continue;

    const target = normalizeStatus(raw);
    if (!target) continue;

    const autoRow = byId.get(id);
    if (!autoRow) {
      result.unmatched++;
      continue;
    }
    result.matched++;

    // Only ever strengthen. Someone who unsubscribed themselves must not be
    // downgraded to a caller's softer note, and re-applying the same value every
    // tick would rewrite status_at forever and lose when it actually happened.
    const current = cell(auto, autoRow, "status");
    if (!outranks(target as LeadStatus, current)) {
      result.skipped++;
      continue;
    }

    const out = await setOptOut(
      { token: cell(auto, autoRow, "confirm_token") },
      target as LeadStatus,
      STATUS_SOURCE.caller,
    );
    if (out.found && !out.alreadyOut) result.applied++;
  }

  return result;
}
