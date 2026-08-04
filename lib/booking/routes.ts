// The campaign registry: which host serves which campaign.
//
// Two workshops now run in parallel — the founder workshop on its own subdomain
// and the HR workshop on another — each with its own sheet, its own Meta form,
// its own flow (self_serve vs sdr_assisted) and its own landing copy. The host a
// request arrives on is what tells them apart.
//
// Source is CAMPAIGN_ROUTES, a JSON array:
//
//   CAMPAIGN_ROUTES=[
//     {"key":"founder","host":"<founder-host>",
//      "sheetId":"1qt-...","formTab":"Saturday_Workshop"},
//     {"key":"hr","host":"<hr-host>",
//      "sheetId":"15UV...","formTab":"HR_Campaign"}
//   ]
//
// Per-route `automationTab`, `controlTab` and `baseUrl` are optional and fall
// back to SHEET_AUTOMATION_TAB / SHEET_CONTROL_TAB / LANDING_BASE_URL. baseUrl
// defaults to https://<host>, which is right whenever the campaign is served on
// its own domain — i.e. always, since that is the point of this file.
//
// UNSET IS A SUPPORTED STATE, and it is the state this deployment is in today:
// one campaign, addressed by SHEET_ID / SHEET_FORM_TAB / LANDING_BASE_URL. With
// CAMPAIGN_ROUTES absent, defaultRoute() rebuilds exactly that single campaign
// from those variables and everything behaves as it did before routing existed.
// That is what makes this change deployable without an env change, and what lets
// it be reverted by clearing one variable.
//
// Malformed JSON THROWS rather than falling back. The fallback is a live
// campaign's sheet; silently serving campaign A from campaign B's data because a
// bracket was missing is the exact failure this file exists to prevent, and it
// would look completely healthy. Fail-closed here is the same call campaign.ts
// makes and the opposite of control.ts's switches — messaging the wrong sheet is
// worse than not starting.
import { env } from "./env";
import { ActiveCampaign, withCampaign, activeCampaign } from "./campaignContext";

export type { ActiveCampaign };

/**
 * The hostname this request was addressed to.
 *
 * X-Forwarded-Host first: the app runs behind a reverse proxy (docker-compose
 * `app` service), and a proxy that terminates TLS commonly rewrites Host to the
 * upstream name — which would be "app:3000" and match no campaign. If the proxy
 * is instead configured to preserve Host, that header is still correct and the
 * forwarded one is simply absent, so checking both is right either way.
 */
export function hostOf(req: { headers: { get(name: string): string | null } }): string {
  const fwd = req.headers.get("x-forwarded-host") || "";
  // A proxy chain sends a comma-separated list; the first entry is the original.
  return normalizeHost(fwd.split(",")[0] || req.headers.get("host") || "");
}

/** Strip port and lowercase, so "HRworkshop.diacto.com:3000" matches the route. */
export function normalizeHost(host: string): string {
  return (host || "").trim().toLowerCase().split(":")[0];
}

/** The implicit single campaign, built from the pre-routing env vars. */
function defaultRoute(): ActiveCampaign {
  // Informational only — routeForHost() matches every host when there is one
  // campaign — so a LANDING_BASE_URL that will not parse must not throw here and
  // take down a deployment that never asked for routing.
  let host = "";
  try {
    host = normalizeHost(new URL(env.landingBaseUrl()).host);
  } catch {
    host = "";
  }
  return {
    key: "default",
    host,
    sheetId: env.rawSheetId(),
    formTab: env.rawFormTab(),
    automationTab: "",
    controlTab: "",
    baseUrl: env.landingBaseUrl(),
  };
}

function parse(raw: string): ActiveCampaign[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`CAMPAIGN_ROUTES is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("CAMPAIGN_ROUTES must be a non-empty JSON array of campaign routes");
  }
  const routes = parsed.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const s = (k: string) => String(o[k] ?? "").trim();
    // key/host/sheetId/formTab are the four that cannot be guessed. A route
    // missing any of them would resolve to *something* — the env fallback — and
    // that something is another campaign's sheet.
    for (const k of ["key", "host", "sheetId", "formTab"]) {
      if (!s(k)) throw new Error(`CAMPAIGN_ROUTES[${i}] is missing "${k}"`);
    }
    const host = normalizeHost(s("host"));
    return {
      key: s("key"),
      host,
      sheetId: s("sheetId"),
      formTab: s("formTab"),
      automationTab: s("automationTab"),
      controlTab: s("controlTab"),
      baseUrl: (s("baseUrl") || `https://${host}`).replace(/\/+$/, ""),
    };
  });
  // Two routes on one host means one of them is unreachable, and which one wins
  // would depend on array order — a silent, order-dependent misroute. Same for a
  // duplicated key, which selects landing content.
  for (const field of ["host", "key"] as const) {
    const seen = new Set<string>();
    for (const r of routes) {
      if (seen.has(r[field])) throw new Error(`CAMPAIGN_ROUTES has two routes with ${field} "${r[field]}"`);
      seen.add(r[field]);
    }
  }
  return routes;
}

/** Every configured campaign, or the single implicit one when CAMPAIGN_ROUTES is unset. */
export function allRoutes(): ActiveCampaign[] {
  const raw = (process.env.CAMPAIGN_ROUTES || "").trim();
  return raw ? parse(raw) : [defaultRoute()];
}

/** True when more than one campaign is configured — i.e. host routing is live. */
export function isMultiCampaign(): boolean {
  return Boolean((process.env.CAMPAIGN_ROUTES || "").trim());
}

/**
 * The campaign serving `host`, or null when no route matches.
 *
 * Null rather than a fallback, on purpose. An unrecognised Host on a
 * multi-campaign deployment means a subdomain nobody configured — a staging
 * alias, a bare IP, a probe. Registering that visitor into whichever campaign
 * happened to be first in the array is how the founder page came to write into
 * the HR sheet. Callers decide what to do with null; none of them guess.
 *
 * Single-campaign deployments always match, because there is only one campaign
 * and no ambiguity about who a request belongs to.
 */
export function routeForHost(host: string): ActiveCampaign | null {
  const routes = allRoutes();
  if (!isMultiCampaign()) return routes[0];
  const h = normalizeHost(host);
  return routes.find((r) => r.host === h) ?? null;
}

/** Look up `route` by key. Used by the landing page to pick its copy. */
export function routeForKey(key: string): ActiveCampaign | null {
  return allRoutes().find((r) => r.key === key) ?? null;
}

/**
 * Run `fn` inside the campaign that serves `host`.
 *
 * Throws on an unmatched host rather than returning, so a caller cannot forget
 * to check: every API route below this is a WRITE path or issues a pass, and
 * doing either for an unknown campaign is worse than a 404.
 */
export function withHost<T>(host: string, fn: (c: ActiveCampaign) => T): T {
  const route = routeForHost(host);
  if (!route) {
    throw new UnknownHostError(
      `No campaign is configured for host "${normalizeHost(host)}". ` +
        `Configured: ${allRoutes().map((r) => r.host).join(", ")}`,
    );
  }
  return withCampaign(route, () => fn(route));
}

/** Distinguishable from a genuine fault, so routes can answer 404 rather than 500. */
export class UnknownHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownHostError";
  }
}

export { withCampaign, activeCampaign };
