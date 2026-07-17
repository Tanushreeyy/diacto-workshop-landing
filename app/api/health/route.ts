import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/booking/env";
import { readTable, resolveHeader } from "@/lib/booking/google";
import { FORM } from "@/lib/booking/service";
import { WORKSHOP, WA_TEMPLATES, REMINDERS } from "@/lib/booking/config";
import { readSwitches } from "@/lib/booking/control";

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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const qs = new URL(req.url).searchParams.get("secret");
  if (!secret || (auth !== `Bearer ${secret}` && qs !== secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [checks, switches] = await Promise.all([
    Promise.all([
      checkEnv(),
      checkSheet(),
      checkFormTabs(),
      checkGraph(),
      checkWati(),
      checkSlack(),
    ]),
    readSwitches().catch(() => null),
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
        // The live switch state, so a pause is never a guess. null = couldn't read.
        switches: switches
          ? { ingest: switches.ingest, nurture: switches.nurture, reminders: switches.reminders, source: switches.source }
          : "unreadable",
        watiWebhook: env.watiWebhookSecret() ? "secret set" : "no secret (webhook disabled)",
        eventStartUtc: WORKSHOP.eventStartUtc,
        reminders: REMINDERS.map((r) => `${r.key} @ ${r.at}`),
        tickBudgetMs: env.tickBudgetMs(),
      },
    },
    { status: ok ? 200 : 503 },
  );
}
