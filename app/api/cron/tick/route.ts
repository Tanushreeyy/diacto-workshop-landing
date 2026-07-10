import { NextRequest, NextResponse } from "next/server";
import { runTick } from "@/lib/booking/service";
import { env } from "@/lib/booking/env";

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
  try {
    const summary = await runTick();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[/api/cron/tick]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
