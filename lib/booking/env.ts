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
  sheetTab: () => opt("SHEET_TAB", "Sheet1"),

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

  // Slack
  slackWebhook: () => opt("SLACK_WEBHOOK_URL"),

  // Plumbing
  cronSecret: () => req("CRON_SECRET"),
  landingBaseUrl: () => req("LANDING_BASE_URL").replace(/\/+$/, ""),
};
