import { NextRequest, NextResponse } from "next/server";
import { runTick } from "@/lib/booking/service";
import { env } from "@/lib/booking/env";
import { allRoutes, isMultiCampaign, withCampaign } from "@/lib/booking/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds (Vercel)

// The scheduled engine. Call hourly from any trigger (Vercel Cron, node-cron,
// GitHub Actions, cron-job.org…). Vercel Cron auto-sends `Authorization: Bearer
// $CRON_SECRET`; other triggers can pass it as a header or `?secret=`.
function authorized(req: NextRequest): boolean {
  const secret = env.cronSecret();
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("secret") === secret;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let routes;
  try {
    routes = allRoutes();
  } catch (e) {
    // routes.ts fails closed on malformed CAMPAIGN_ROUTES. Nothing has been read
    // or sent at this point, so this is the safe place to stop.
    console.error("[/api/cron/tick] routes", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  // One pass per campaign, SEQUENTIALLY and each in its own scope.
  //
  // Sequential because the passes are not independent: they share the WATI and
  // Graph rate limits, the sheet lock, and TICK_BUDGET_MS. Running them
  // concurrently would let two campaigns interleave sends on one WhatsApp number
  // and blow the budget that exists to keep a tick inside its timeout.
  //
  // Each is isolated with try/catch so one campaign's bad control tab cannot
  // stop the other's reminders — the failure that would otherwise recreate the
  // original outage, just with an extra campaign to lose.
  const results = [];
  for (const route of routes) {
    try {
      const summary = await withCampaign(route, () => runTick());
      // `campaignKey`, not `campaign` — TickSummary already has a `campaign`
      // field carrying describeCampaign()'s human label, and shadowing it here
      // would replace the description with a bare key in every tick log.
      results.push({ campaignKey: route.key, ok: true, ...summary });
    } catch (e) {
      console.error(`[/api/cron/tick] ${route.key}`, e);
      results.push({ campaignKey: route.key, ok: false, error: (e as Error).message });
    }
  }

  const ok = results.every((r) => r.ok);
  // Single-campaign deployments keep the pre-routing response shape verbatim.
  const body = isMultiCampaign()
    ? { ok, campaigns: results }
    : { ...results[0], ok };
  return NextResponse.json(body, { status: ok ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
