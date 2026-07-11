// Event-pass PDF generator — pure-JS port (pdf-lib) of the ReportLab pass,
// coordinates/fonts/colours taken from the decoded original. Runs in any Node
// runtime, so it works on Vercel / VPS / anywhere. Per-attendee: name, company,
// and the unique Registration ID; everything else is fixed template.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { WORKSHOP } from "./config";

export interface PassData {
  name: string;
  company: string;
  regId: string;
  dateLabel?: string;
  timeLabel?: string;
  venue?: string;
  support?: string;
}

const NAVY = rgb(0.043137, 0.117647, 0.2);
const GOLD = rgb(0.85098, 0.643137, 0.254902);
const SLATE = rgb(0.623529, 0.701961, 0.784314);
const WHITE = rgb(1, 1, 1);
const DARK = rgb(0.101961, 0.141176, 0.2);
const LABEL = rgb(0.419608, 0.447059, 0.501961);
const GOLD_DARK = rgb(0.541176, 0.415686, 0.121569);
const FAINT = rgb(0.494118, 0.576471, 0.658824);
const RIGHT_BG = rgb(0.960784, 0.94902, 0.92549);
const DIV_LEFT = rgb(0.164706, 0.254902, 0.34902);
const DIV_RIGHT = rgb(0.847059, 0.823529, 0.768627);

function fitLeft(
  page: PDFPage,
  s: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  maxW: number,
) {
  let sz = size;
  while (sz > 6 && font.widthOfTextAtSize(s, sz) > maxW) sz -= 0.5;
  page.drawText(s, { x, y, size: sz, font, color });
}

function fitCenter(
  page: PDFPage,
  s: string,
  cx: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  maxW: number,
) {
  let sz = size;
  while (sz > 5 && font.widthOfTextAtSize(s, sz) > maxW) sz -= 0.5;
  const w = font.widthOfTextAtSize(s, sz);
  page.drawText(s, { x: cx - w / 2, y, size: sz, font, color });
}

export async function generatePass(data: PassData): Promise<Uint8Array> {
  const dateLabel = data.dateLabel ?? WORKSHOP.dateLabel;
  const timeLabel = data.timeLabel ?? WORKSHOP.timeLabel;
  const venue = data.venue ?? WORKSHOP.venue;
  const support = data.support ?? WORKSHOP.supportNumber;

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.2756, 255.1181]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const boldObl = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  const t = (
    s: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont,
    color: ReturnType<typeof rgb>,
  ) => page.drawText(s, { x, y, size, font, color });

  // Backgrounds
  page.drawRectangle({ x: 0, y: 0, width: 249.4488, height: 255.1181, color: NAVY });
  page.drawRectangle({ x: 249.4488, y: 0, width: 345.8268, height: 255.1181, color: RIGHT_BG });
  page.drawRectangle({ x: 0, y: 0, width: 249.4488, height: 8.503937, color: GOLD });

  // Left panel
  t("DIACTO TECHNOLOGIES PVT LTD PRESENTS", 28.34646, 218.2677, 8.5, bold, GOLD);
  t("HIGH-PERFORMANCE", 28.34646, 187.0866, 19, bold, WHITE);
  t("TEAMS WORKSHOP", 28.34646, 164.4094, 19, bold, WHITE);
  t("A Business Growth Workshop for Founders", 28.34646, 141.7323, 9.5, helv, SLATE);
  page.drawLine({
    start: { x: 28.34646, y: 124.7244 },
    end: { x: 221.1024, y: 124.7244 },
    thickness: 0.6,
    color: DIV_LEFT,
  });
  t("Hire Right. Train Right.", 28.34646, 102.0472, 10, bold, WHITE);
  t("Manage Right. Retain Right.", 28.34646, 85.03937, 10, bold, WHITE);
  t("“Great Teams Build Great Businesses.”", 28.34646, 53.85827, 9, boldObl, GOLD);
  t("FREE ENTRY  |  FOUNDERS & BUSINESS OWNERS ONLY", 28.34646, 18.4252, 7, helv, FAINT);

  // Right panel — attendee
  t("ATTENDEE", 277.7953, 221.1024, 7, bold, LABEL);
  const rightMaxW = 566.9291 - 277.7953;
  fitLeft(page, data.name, 277.7953, 201.2598, 16, bold, DARK, rightMaxW);
  fitLeft(page, data.company, 277.7953, 185.6693, 9, helv, LABEL, rightMaxW);

  // Registration-ID chip (navy fill; gold label + white value)
  page.drawRectangle({
    x: 436.5354,
    y: 198.4252,
    width: 130.3937,
    height: 25.5118,
    color: NAVY,
  });
  const chipCx = (436.5354 + 566.9291) / 2;
  fitCenter(page, "REGISTRATION ID", chipCx, 214.8661, 6.5, bold, GOLD, 120);
  fitCenter(page, data.regId, chipCx, 202.3937, 10, bold, WHITE, 120);

  // Divider + details
  page.drawLine({
    start: { x: 277.7953, y: 170.0787 },
    end: { x: 566.9291, y: 170.0787 },
    thickness: 0.6,
    color: DIV_RIGHT,
  });
  t("DATE", 277.7953, 153.0709, 6.5, bold, LABEL);
  fitLeft(page, dateLabel, 277.7953, 140.315, 11.5, bold, DARK, rightMaxW);
  t("TIME", 277.7953, 120.4724, 6.5, bold, LABEL);
  fitLeft(page, timeLabel, 277.7953, 107.7165, 11.5, bold, DARK, rightMaxW);
  t("VENUE", 277.7953, 87.87402, 6.5, bold, LABEL);
  fitLeft(page, venue, 277.7953, 75.11811, 11.5, bold, DARK, rightMaxW);

  t("SHOW THIS PASS (DIGITAL OR PRINT) AT THE ENTRY DESK", 277.7953, 48.18898, 8, bold, GOLD_DARK);
  t(`Support: ${support}  ·  ${WORKSHOP.website}`, 277.7953, 18.4252, 7, helv, LABEL);

  return doc.save();
}

// Convenience: base64 for a Graph fileAttachment.
export async function generatePassBase64(data: PassData): Promise<string> {
  const bytes = await generatePass(data);
  return Buffer.from(bytes).toString("base64");
}
