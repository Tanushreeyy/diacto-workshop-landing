// Which campaign the current request (or tick pass) belongs to.
//
// Everything about a campaign was already data-driven — dates, templates, flow,
// reminders, pass copy, all loaded from a control tab. Everything except WHICH
// SHEET, which stayed `req("SHEET_ID")`: a process-wide, deploy-time constant.
// So the system could describe any campaign and run exactly one.
//
// That held while campaigns were sequential. It broke the moment two ran at
// once: flipping SHEET_ID from the founder workshop to the HR workshop pointed
// the whole process at HR, so the founder sheet stopped being ingested (75 leads
// sat untouched) while the founder LANDING PAGE went on registering visitors —
// into HR's sheet, with HR's Event Pass. One singleton, two live campaigns.
//
// So the sheet becomes request-scoped rather than process-scoped. The host the
// request arrived on selects the campaign; the tick runs once per campaign.
//
// This module imports NOTHING, deliberately. env.ts imports it, and a
// dependency-free holder can never form an import cycle — the same reasoning as
// tabOverrides.ts, which parks its values per sheet id for exactly this hazard:
//
//   "Point a second sheet at the same process and the second load overwrites
//    the first ... That is how one campaign's registrations end up appended to
//    another's sheet."
//
// That comment had the right diagnosis at the wrong layer. This is the layer.
import { AsyncLocalStorage } from "node:async_hooks";

/** The sheet-shaped half of a campaign route — what env.ts needs to resolve. */
export interface ActiveCampaign {
  /** Stable id: "founder", "hr". Selects landing content and labels logs. */
  key: string;
  /** Hostname this campaign is served on, lowercased, no port. */
  host: string;
  sheetId: string;
  /** Comma-separated, exactly like SHEET_FORM_TAB — one tab per live Instant Form. */
  formTab: string;
  /** Blank → fall back to SHEET_AUTOMATION_TAB. */
  automationTab: string;
  /** Blank → fall back to SHEET_CONTROL_TAB. */
  controlTab: string;
  /** Absolute origin for this campaign's pass and booking links. Blank → LANDING_BASE_URL. */
  baseUrl: string;
}

const storage = new AsyncLocalStorage<ActiveCampaign>();

/**
 * Run `fn` with `campaign` as the active one.
 *
 * AsyncLocalStorage rather than a module-level variable because these are
 * concurrent: two requests for two different hosts can be in flight in the same
 * process at the same time, and the automation tab is WRITTEN. A shared mutable
 * "current campaign" would be the original bug with extra steps.
 */
export function withCampaign<T>(campaign: ActiveCampaign, fn: () => T): T {
  return storage.run(campaign, fn);
}

/**
 * The active campaign, or undefined outside any withCampaign() scope.
 *
 * Undefined is a normal state, not an error: with CAMPAIGN_ROUTES unset there is
 * exactly one campaign and the env vars are authoritative, which is precisely
 * how this deployment behaved before routing existed. env.ts treats undefined as
 * "use the env var" so adding this file changes nothing until routes are set.
 */
export function activeCampaign(): ActiveCampaign | undefined {
  return storage.getStore();
}
