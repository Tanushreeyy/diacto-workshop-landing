// Microsoft 365 Graph — send email as workshop@diacto.com using application
// (client-credentials) permissions with Mail.Send, scoped by the Application
// Access Policy. Proven live: token 200, sendMail 202, attachment 202.

import { env } from "./env";

let cached: { token: string; exp: number } | null = null;

async function graphToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const body = new URLSearchParams({
    client_id: env.azureClientId(),
    client_secret: env.azureClientSecret(),
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(
    `https://login.microsoftonline.com/${env.azureTenantId()}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!r.ok) throw new Error(`Graph token failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3599) * 1000 };
  return cached.token;
}

export interface MailAttachment {
  name: string;
  contentBytes: string; // base64
  contentType?: string;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  const token = await graphToken();
  const message: Record<string, unknown> = {
    subject: opts.subject,
    body: { contentType: "HTML", content: opts.html },
    toRecipients: [{ emailAddress: { address: opts.to } }],
  };
  if (opts.attachments?.length) {
    message.attachments = opts.attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name,
      contentType: a.contentType ?? "application/pdf",
      contentBytes: a.contentBytes,
    }));
  }
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.graphSender())}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    },
  );
  if (r.status !== 202 && !r.ok) {
    throw new Error(`sendMail failed: ${r.status} ${await r.text()}`);
  }
}
