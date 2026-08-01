import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/booking/env";
import { readTable, resolveHeader } from "@/lib/booking/google";
import { FORM } from "@/lib/booking/service";
import { WA_TEMPLATES } from "@/lib/booking/config";
import { readSwitches, loadTabOverrides } from "@/lib/booking/control";
import { loadCampaign, campaignProblems, hasEnded } from "@/lib/booking/campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deployment preflight. Verifies every integration actually works from THIS host
// — so a misconfigured deploy is caught immediately instead of when the first
// real lead arrives. Guarded by CRON_SECRET; never returns a secret value, only
// whether each piece is wired up.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/health

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

async function checkEnv(): Promise<Check> {
  const required = [
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "SHEET_ID",
    // No defaults any more (see env.ts): unset means the deployment cannot say
    // which tabs it drives, and it used to fall back to the production ones.
    "SHEET_FORM_TAB",
    "SHEET_AUTOMATION_TAB",
    "SHEET_CONTROL_TAB",
    "WATI_API_ENDPOINT",
    "WATI_ACCESS_TOKEN",
    "CRON_SECRET",
    "LANDING_BASE_URL",
  ];
  const missing = required.filter((k) => !process.env[k]);
  return {
    name: "env",
    ok: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(", ")}` : `all ${required.length} set`,
  };
}

async function checkSheet(): Promise<Check> {
  try {
    const auto = await readTable(env.autoTab());
    const need = [
      "phone_key",
      "confirm_token",
      "registration_complete",
      "reg_id",
      "expectations",
    ];
    const missing = need.filter((c) => !(c in auto.index));
    if (missing.length) {
      return { name: "google_sheet", ok: false, detail: `tab '${env.autoTab()}' missing columns: ${missing.join(", ")}` };
    }
    return { name: "google_sheet", ok: true, detail: `read '${env.autoTab()}' — ${auto.rows.length} row(s), schema OK` };
  } catch (e) {
    return { name: "google_sheet", ok: false, detail: (e as Error).message.slice(0, 160) };
  }
}

// Every tab named in SHEET_FORM_TAB must actually be readable — a typo'd tab name
// is otherwise invisible: the tick swallows the read error and simply ingests
// nothing, which looks exactly like "the ad isn't running yet".
async function checkFormTabs(): Promise<Check> {
  const tabs = env.formTabs();
  if (!tabs.length) return { name: "form_tabs", ok: false, detail: "SHEET_FORM_TAB is empty" };
  // Resolved against the SAME candidate lists ingest uses (FORM), so this can never
  // drift from reality. name/email/phone are load-bearing: Meta names columns after
  // the question text, so a reworded form silently renames them — and a lead with no
  // phone gets no WhatsApp and cannot be looked up. That FAILS the check, not a note.
  const results = await Promise.all(
    tabs.map(async (t) => {
      try {
        const f = await readTable(t);
        const has = (c: string[]) => !!resolveHeader(f, c);
        const missing = (["name", "email", "phone"] as const).filter((k) => !has(FORM[k]));
        const mark = (k: keyof typeof FORM) => (has(FORM[k]) ? "y" : "-");
        const detail = `${t}: ${f.rows.length} row(s) [desig ${mark("designation")} · company ${mark("company")} · emp ${mark("employeeCount")} · loc ${mark("location")}]`;
        return missing.length ? `${detail} MISSING REQUIRED: ${missing.join(", ")}` : detail;
      } catch {
        return `${t}: UNREADABLE`;
      }
    }),
  );
  const bad = results.filter((r) => r.includes("UNREADABLE") || r.includes("MISSING REQUIRED"));
  return {
    name: "form_tabs",
    ok: bad.length === 0,
    detail: results.join(" | "),
  };
}

async function checkGraph(): Promise<Check> {
  try {
    const body = new URLSearchParams({
      client_id: env.azureClientId(),
      client_secret: env.azureClientSecret(),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const r = await fetch(
      `https://login.microsoftonline.com/${env.azureTenantId()}/oauth2/v2.0/token`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
    );
    if (!r.ok) return { name: "email_m365", ok: false, detail: `token ${r.status}` };
    return { name: "email_m365", ok: true, detail: `token OK · sends as ${env.graphSender()}` };
  } catch (e) {
    return { name: "email_m365", ok: false, detail: (e as Error).message.slice(0, 160) };
  }
}

async function checkWati(): Promise<Check> {
  try {
    const r = await fetch(`${env.watiEndpoint()}/api/v1/getMessageTemplates`, {
      headers: { Authorization: `Bearer ${env.watiToken()}` },
    });
    if (!r.ok) return { name: "whatsapp_wati", ok: false, detail: `HTTP ${r.status}` };
    const j = (await r.json()) as { messageTemplates?: { elementName: string; status: string }[] };
    const all = j.messageTemplates ?? [];
    const wanted = Object.values(WA_TEMPLATES);
    const found = wanted.filter((n) => all.some((t) => t.elementName === n));
    const approved = wanted.filter((n) =>
      all.some((t) => t.elementName === n && t.status === "APPROVED"),
    );
    return {
      name: "whatsapp_wati",
      ok: true, // auth works; approval is Meta's business, not a config error
      detail: `auth OK · ${found.length}/${wanted.length} templates exist · ${approved.length}/${wanted.length} APPROVED`,
    };
  } catch (e) {
    return { name: "whatsapp_wati", ok: false, detail: (e as Error).message.slice(0, 160) };
  }
}

async function checkSlack(): Promise<Check> {
  const url = env.slackWebhook();
  if (!url) return { name: "slack", ok: true, detail: "not configured (optional)" };
  return { name: "slack", ok: url.startsWith("https://hooks.slack.com/"), detail: "webhook configured" };
}

// Is the campaign we are about to run for actually describable?
//
// Fails the whole health check, because every other check can pass while the
// campaign config is wrong — and a healthy-looking deployment messaging people
// about the wrong workshop is the failure this whole file exists to surface.
async function checkCampaign(): Promise<Check> {
  try {
    const c = await loadCampaign();
    const problems = campaignProblems(c);
    if (problems.length) {
      return { name: "campaign", ok: false, detail: problems.join(" · ").slice(0, 300) };
    }
    const state = hasEnded(c) ? "ENDED (tick auto-stops)" : "running";
    return {
      name: "campaign",
      ok: true,
      detail: `${c.label} [${c.flow}] · ${c.event.dateShort} · ${state} · ${c.source}`,
    };
  } catch (e) {
    return { name: "campaign", ok: false, detail: (e as Error).message.slice(0, 300) };
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const qs = new URL(req.url).searchParams.get("secret");
  if (!secret || (auth !== `Bearer ${secret}` && qs !== secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Resolve any control-tab tab-name overrides first, so the checks and the
  // reported config below reflect the tabs the tick will actually use.
  await loadTabOverrides(true);

  const [checks, switches, campaign] = await Promise.all([
    Promise.all([
      checkEnv(),
      checkSheet(),
      checkFormTabs(),
      checkGraph(),
      checkWati(),
      checkSlack(),
      checkCampaign(),
    ]),
    readSwitches().catch(() => null),
    loadCampaign().catch(() => null),
  ]);
  const ok = checks.every((c) => c.ok);

  return NextResponse.json(
    {
      ok,
      checks,
      config: {
        landingBaseUrl: env.landingBaseUrl(),
        formTabs: env.formTabs(),
        automationTab: env.autoTab(),
        controlTab: env.controlTab(),
        callingTab: env.callingTab() || null,
        // The live switch state, so a pause is never a guess. null = couldn't read.
        switches: switches
          ? {
              ingest: switches.ingest,
              nurture: switches.nurture,
              reminders: switches.reminders,
              email: switches.email,
              whatsapp: switches.whatsapp,
              source: switches.source,
            }
          : "unreadable",
        watiWebhook: env.watiWebhookSecret() ? "secret set" : "no secret (webhook disabled)",
        // Campaign-derived, not module constants. Reporting WORKSHOP/REMINDERS here
        // was how EVENT_* being unset in production stayed invisible: health showed
        // the config.ts defaults and called them healthy, while the live campaign
        // ran on a previous workshop's dates.
        campaign: campaign
          ? {
              label: campaign.label,
              flow: campaign.flow,
              managed: campaign.managed,
              eventStartUtc: campaign.event.startUtc,
              dateShort: campaign.event.dateShort,
              venue: campaign.event.venue,
              ended: hasEnded(campaign),
              reminders: campaign.reminders.map((r) => `${r.key} @ ${r.at}`),
              source: campaign.source,
            }
          : "unreadable",
        tickBudgetMs: env.tickBudgetMs(),
      },
    },
    { status: ok ? 200 : 503 },
  );
}
