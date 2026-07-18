// Centralised, lazy env access. Getters throw only when actually called at
// runtime (never at import/build time) so `next build` never needs secrets.

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // Microsoft 365 / Graph
  azureTenantId: () => req("AZURE_TENANT_ID"),
  azureClientId: () => req("AZURE_CLIENT_ID"),
  azureClientSecret: () => req("AZURE_CLIENT_SECRET"),
  graphSender: () => opt("GRAPH_SENDER_UPN", "workshop@diacto.com"),

  // Google Sheets (service account)
  googleSaEmail: () => req("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
  // Private key is stored with escaped newlines in most hosts' env UIs.
  googlePrivateKey: () => req("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  sheetId: () => req("SHEET_ID"),
  // Meta's connector owns the form tabs — we only ever READ them.
  //
  // Comma-separated, because a new Instant Form gets a NEW connection and so a
  // NEW tab: "Sheet2,v3_form". Ingesting from both means there is no cutover
  // window where a submission to the outgoing form is silently dropped. Dedupe
  // is global (lead_id + phone_key across the automation tab), so a lead can
  // never be ingested twice no matter how many tabs are listed.
  // ── All three tab names are REQUIRED, with no default. ──
  //
  // They used to default to "v2_form", "automation" and "control" — the
  // PRODUCTION tabs. That meant one forgotten variable silently aimed a staging
  // deployment at live data: it would read the real automation tab, message real
  // leads through the same WATI number and mailbox, and share production's kill
  // switches, header baseline and mail watermark. Nothing would look wrong. The
  // build would pass and the tick would report itself healthy.
  //
  // A default is only kind when being wrong is cheap. Here the wrong value is
  // indistinguishable from the right one until real people receive messages, so
  // it is better to refuse to start. These getters are lazy, so a missing
  // variable throws inside the tick, which catches it, sends nothing and reports
  // the error — and /api/health names the missing variable outright.
  formTabs: () =>
    req("SHEET_FORM_TAB")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  autoTab: () => req("SHEET_AUTOMATION_TAB"),
  // Kill switches live in the sheet so pausing never needs a deploy. A missing
  // TAB still means "everything enabled" (control.ts fails open by design); a
  // missing VARIABLE is a misconfiguration and is refused here.
  controlTab: () => req("SHEET_CONTROL_TAB"),

  // WhatsApp (WATI)
  watiEndpoint: () => req("WATI_API_ENDPOINT").replace(/\/+$/, ""),
  watiToken: () => req("WATI_ACCESS_TOKEN"),
  // Name of the WA-5 document-header variable (must match the WATI template).
  watiDocParam: () => opt("WATI_WA5_DOC_PARAM", "pdfLink"),
  // WA-5 delivery of the Event Pass:
  //   false (default) → pass sent as a tap-to-download link in the body ({{2}})
  //   true            → pass attached natively via a dynamic DOCUMENT header
  // Native mode needs a WATI template whose media header is a real variable.
  // WATI's UI currently rejects a {{var}} in the header URL, so default is off.
  wa5NativeDoc: () => opt("WA5_NATIVE_DOC", "false") === "true",

  // WATI cannot sign its webhooks — its own setup guide says to "validate
  // incoming requests" but ships no signature header or shared secret. So the
  // secret rides in the URL (WATI lets you enter an arbitrary one), exactly like
  // the cron tick's ?secret=. Without it, anyone who guesses the path could POST
  // a waId and silence a lead. Unset = the webhook refuses every request.
  watiWebhookSecret: () => opt("WATI_WEBHOOK_SECRET"),

  // Slack
  slackWebhook: () => opt("SLACK_WEBHOOK_URL"),

  // Plumbing
  cronSecret: () => req("CRON_SECRET"),
  // How long a single tick may spend doing work before it stops and leaves the
  // rest for the next run. Keeps us under ANY host's function timeout (Netlify
  // free ~10s, Vercel Hobby similar). Long-running hosts can raise it freely.
  tickBudgetMs: () => parseInt(opt("TICK_BUDGET_MS", "8000"), 10) || 8000,
  landingBaseUrl: () => req("LANDING_BASE_URL").replace(/\/+$/, ""),
};
