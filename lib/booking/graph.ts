// Microsoft 365 Graph — send email as workshop@diacto.com using application
// (client-credentials) permissions with Mail.Send, scoped by the Application
// Access Policy. Proven live: token 200, sendMail 202, attachment 202.

import { env, GraphCreds } from "./env";

// Keyed by tenant+client: a second mailbox lives in a second tenant with its own
// app registration, and one shared slot would hand its token to the other.
const cached = new Map<string, { token: string; exp: number }>();

async function graphToken(creds: GraphCreds = env.graphCreds()): Promise<string> {
  const key = `${creds.tenantId}:${creds.clientId}`;
  const hit = cached.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(
    `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      // Next patches global fetch and caches responses. An access token is the
      // one thing that must never come from a cache: a stale one is silently
      // accepted here and rejected by Graph as expired, which is exactly how
      // this surfaced — a two-day-old token whose roles claim predated the
      // Mail.Read grant.
      cache: "no-store",
    },
  );
  if (!r.ok) throw new Error(`Graph token failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  const entry = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3599) * 1000 };
  cached.set(key, entry);
  return entry.token;
}

/**
 * Read side of Graph. Needs the Mail.Read application permission, granted
 * 18 July 2026 and scoped by the existing Application Access Policy to
 * workshop@diacto.com alone.
 *
 * Returns null on 403 rather than throwing, so a consent that gets revoked
 * degrades to "we stop noticing replies" instead of taking the whole tick down
 * with it. Every other failure throws and is reported normally.
 */
export async function graphGet<T>(path: string, creds?: GraphCreds): Promise<T | null> {
  const token = await graphToken(creds);
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store", // a cached inbox is a missed reply
  });
  // "This mailbox is not readable by these credentials." 403 is a revoked or
  // never-granted Mail.Read; 404 is the mailbox being gone from the tenant
  // altogether (ErrorInvalidUser), which is what a deleted workspace account
  // looks like; 401 is a dead secret. None is a reason to take a tick down, and
  // with more than one mailbox watched, none may stop the others being read.
  if (r.status === 401 || r.status === 403 || r.status === 404) {
    console.error(`[graph] ${r.status} on ${path} — mailbox unreadable, skipping it`);
    return null;
  }
  if (!r.ok) throw new Error(`graphGet ${path} failed: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
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
      cache: "no-store",
    },
  );
  if (r.status !== 202 && !r.ok) {
    throw new Error(`sendMail failed: ${r.status} ${await r.text()}`);
  }
}
