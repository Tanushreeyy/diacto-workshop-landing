// WhatsApp via WATI. Auth + template listing proven live. Sends use approved
// templates by name (create + approve them in the WATI dashboard first).

import { env } from "./env";

export interface WaParam {
  name: string; // matches the template variable name ("1", "2", … or named)
  value: string;
}

// Normalise an Indian/E.164 number to digits with country code, as WATI expects
// (e.g. "917387731069"). Strips Meta test-lead "p:" prefixes and punctuation.
export function normalizeWhatsApp(raw: string): string {
  let d = (raw || "").replace(/^p:/i, "").replace(/[^\d]/g, "");
  if (d.length === 10) d = "91" + d; // bare 10-digit Indian mobile
  if (d.length === 11 && d.startsWith("0")) d = "91" + d.slice(1);
  return d;
}

export async function sendTemplate(opts: {
  whatsappNumber: string;
  templateName: string;
  broadcastName?: string;
  parameters?: WaParam[];
}): Promise<void> {
  const number = normalizeWhatsApp(opts.whatsappNumber);
  if (!number) throw new Error("WATI send: empty/invalid whatsapp number");
  const url = `${env.watiEndpoint()}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(number)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.watiToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_name: opts.templateName,
      broadcast_name: opts.broadcastName ?? `${opts.templateName}_${Date.now()}`,
      parameters: opts.parameters ?? [],
    }),
  });
  if (!r.ok) throw new Error(`WATI send failed: ${r.status} ${await r.text()}`);
  const j = (await r.json().catch(() => ({}))) as { result?: boolean | string };
  if (j && j.result === false) {
    throw new Error(`WATI send rejected: ${JSON.stringify(j).slice(0, 300)}`);
  }
}
