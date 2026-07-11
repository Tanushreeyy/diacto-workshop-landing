// WhatsApp via WATI. Auth + template listing proven live. Sends use approved
// templates by name (create + approve them in the WATI dashboard first).

import { env } from "./env";
import { toWatiNumber } from "./phone";

export interface WaParam {
  name: string; // matches the template variable name ("1", "2", … or named)
  value: string;
}

// Normalise an Indian/E.164 number to digits with country code, as WATI expects
// (e.g. "917387731069"). Strips Meta test-lead "p:" prefixes and punctuation.
export function normalizeWhatsApp(raw: string): string {
  return toWatiNumber(raw);
}

export async function sendTemplate(opts: {
  whatsappNumber: string;
  templateName: string;
  broadcastName?: string;
  parameters?: WaParam[];
  // Dynamic document-header media (WA-5). WATI attaches header media by passing
  // the public URL as a named parameter whose name matches the template's header
  // variable (per WATI's "send images/PDFs via template" docs).
  headerDocument?: { paramName: string; url: string };
}): Promise<void> {
  const number = normalizeWhatsApp(opts.whatsappNumber);
  if (!number) throw new Error("WATI send: empty/invalid whatsapp number");
  const parameters: WaParam[] = [...(opts.parameters ?? [])];
  if (opts.headerDocument) {
    parameters.push({ name: opts.headerDocument.paramName, value: opts.headerDocument.url });
  }
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
      parameters,
    }),
  });
  if (!r.ok) throw new Error(`WATI send failed: ${r.status} ${await r.text()}`);
  const j = (await r.json().catch(() => ({}))) as { result?: boolean | string };
  if (j && j.result === false) {
    throw new Error(`WATI send rejected: ${JSON.stringify(j).slice(0, 300)}`);
  }
}
