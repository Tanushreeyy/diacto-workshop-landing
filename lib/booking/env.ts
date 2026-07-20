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

/** One Microsoft 365 app registration. */
export interface GraphCreds {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/** A mailbox, and the app registration that can read it. */
export interface Mailbox extends GraphCreds {
  upn: string;
}

export const env = {
  // Microsoft 365 / Graph
  azureTenantId: () => req("AZURE_TENANT_ID"),
  azureClientId: () => req("AZURE_CLIENT_ID"),
  azureClientSecret: () => req("AZURE_CLIENT_SECRET"),
  graphSender: () => opt("GRAPH_SENDER_UPN", "workshop@diacto.com"),

  /**
   * Domains whose senders are US, not leads.
   *
   * Deriving this from the watched mailboxes alone is not enough, and the July
   * mailbox move proved it: once the inbox became workshop@diactocandidhr.com,
   * "@diacto.com" fell off the list, and every mail from the client's own staff
   * would have been read as a lead reply — attempted opt-out, no match, parked,
   * Slack notice, every time. The client's other domains have to be named.
   */
  ownDomains: (): string[] =>
    opt("OWN_DOMAINS", "diacto.com,diactocandidhr.com,salesup.club")
      .split(",")
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean)
      .map((d) => `@${d}`),

  graphCreds: (): GraphCreds => ({
    tenantId: req("AZURE_TENANT_ID"),
    clientId: req("AZURE_CLIENT_ID"),
    clientSecret: req("AZURE_CLIENT_SECRET"),
  }),

  /**
   * Every mailbox whose inbox is watched for replies and unsubscribes.
   *
   * The first is the one we also SEND from. A second lives in a DIFFERENT
   * Microsoft 365 tenant (diactocandidhr.com is not diacto.com — the primary
   * app registration gets ErrorInvalidUser for it), so it needs its own
   * registration, its own admin consent, and its own secret. Reading only: the
   * sender stays GRAPH_SENDER_UPN until someone deliberately moves it.
   *
   * All four _2 variables or none. A half-configured second tenant would fail
   * its token request every tick and read nothing, which looks identical to
   * "nobody has replied" — the failure mode this whole file exists to prevent.
   */
  mailboxes: (): Mailbox[] => {
    const primary: Mailbox = {
      upn: opt("GRAPH_SENDER_UPN", "workshop@diacto.com"),
      tenantId: req("AZURE_TENANT_ID"),
      clientId: req("AZURE_CLIENT_ID"),
      clientSecret: req("AZURE_CLIENT_SECRET"),
    };
    const extra = {
      upn: opt("GRAPH_MAILBOX_2"),
      tenantId: opt("AZURE_TENANT_ID_2"),
      clientId: opt("AZURE_CLIENT_ID_2"),
      clientSecret: opt("AZURE_CLIENT_SECRET_2"),
    };
    const set = Object.entries(extra).filter(([, v]) => v);
    if (!set.length) return [primary];
    if (set.length !== 4) {
      throw new Error(
        `Second mailbox is half-configured — set all of GRAPH_MAILBOX_2, ` +
          `AZURE_TENANT_ID_2, AZURE_CLIENT_ID_2, AZURE_CLIENT_SECRET_2, or none. ` +
          `Present: ${set.map(([k]) => k).join(", ")}`,
      );
    }
    return [primary, extra as Mailbox];
  },

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
  // The calling team's own tab, read-only. Optional: an environment without one
  // (staging) simply skips the sync rather than failing.
  callingTab: () => opt("SHEET_CALLING_TAB", ""),

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
