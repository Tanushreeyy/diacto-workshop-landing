// Generates whatsapp-templates/*.txt — copy-paste-ready sheets for adding each
// WhatsApp template manually in the WATI dashboard. Single source of truth is
// create-wa-templates.mjs. Run: npm run export-wa-templates

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { TEMPLATES, HEADER, FOOTER, BUTTON } from "./create-wa-templates.mjs";

const OUT = "whatsapp-templates";
mkdirSync(OUT, { recursive: true });

const cat = (c) => (c === "MARKETING" ? "Marketing" : "Utility");

TEMPLATES.forEach((t, i) => {
  const num = i + 1;
  const vars = t.labels
    .map((lbl, j) => `  {{${j + 1}}} = ${lbl.padEnd(20)} sample: ${t.example[j]}`)
    .join("\n");

  const headerBlock =
    t.headerFormat === "DOCUMENT"
      ? "────────── HEADER  (Media Type: Document — DYNAMIC) ──────────\n" +
        `Header variable:  {{${t.headerVar}}}\n` +
        `Sample value:     https://diacto-workshop.example.com/api/pass?rid=abc123\n` +
        "Upload the sample Event Pass PDF only if WATI asks (Meta approval sample).\n" +
        "Each attendee's own pass is injected at send time via this variable."
      : `────────── HEADER  (type: Text) ──────────\n${HEADER}`;

  const txt = `Template name : ${t.name}
Category      : ${cat(t.category)}
Language      : English (en)

${headerBlock}

────────── BODY ──────────
${t.body}

────────── FOOTER ──────────
${FOOTER}

────────── VARIABLES / SAMPLE VALUES ──────────
${vars}

────────── BUTTONS ──────────
[URL button · static]  ${BUTTON.text}  →  ${BUTTON.url}
`;

  const file = `WA-${num}_${t.name}.txt`;
  writeFileSync(join(OUT, file), txt);
  console.log("wrote", file);
});

console.log(`\nDone — ${TEMPLATES.length} templates in ${OUT}/`);
