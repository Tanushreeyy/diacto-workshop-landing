// Google Sheets access via a service account (read + write proven live).
// Uses google-auth-library for RS256/JWT auth and the Sheets REST API for I/O.
// All functions are tab-scoped: the Meta form tab is read-only, booking state
// lives in the automation tab.

import { JWT } from "google-auth-library";
import { env } from "./env";

let client: JWT | null = null;
function jwt(): JWT {
  if (!client) {
    client = new JWT({
      email: env.googleSaEmail(),
      key: env.googlePrivateKey(),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }
  return client;
}

const API = "https://sheets.googleapis.com/v4/spreadsheets";

// 0-based column index -> A1 letter (A, B, … Z, AA, …).
export function colLetter(idx0: number): string {
  let n = idx0;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export interface SheetRow {
  rowNumber: number; // 1-based sheet row
  cells: string[];
}

export interface Table {
  tab: string;
  header: string[];
  index: Record<string, number>; // header name -> 0-based column
  rows: SheetRow[];
}

export function cell(table: Table, row: SheetRow, header: string): string {
  const i = table.index[header];
  return i === undefined ? "" : row.cells[i] ?? "";
}

// Find the real header name from a list of candidates.
//
// Meta names a form column after the question text, and the exact punctuation is
// not ours to control: "No. of Employees", "no_of_employees:", "Company Name" have
// all shown up. We compare on letters+digits only, so every one of those collapses
// to the same key. Matching stays EXACT on that key (never substring), so "name"
// can't accidentally claim the "company_name" column.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function resolveHeader(table: Table, candidates: string[]): string | null {
  const byKey = new Map(table.header.map((h) => [norm(h), h]));
  for (const c of candidates) {
    const hit = byKey.get(norm(c));
    if (hit) return hit;
  }
  return null;
}

export async function readTable(tab: string): Promise<Table> {
  const res = await jwt().request<{ values?: string[][] }>({
    url: `${API}/${env.sheetId()}/values/${encodeURIComponent(tab)}!A1:AZ`,
  });
  const values = res.data.values ?? [];
  const header = values[0] ?? [];
  const index: Record<string, number> = {};
  header.forEach((h, i) => (index[h] = i));
  const rows: SheetRow[] = values
    .slice(1)
    .map((cells, i) => ({ rowNumber: i + 2, cells }));
  return { tab, header, index, rows };
}

// Update named columns on a specific row of the table's tab.
export async function updateRow(
  table: Table,
  rowNumber: number,
  updates: Record<string, string>,
): Promise<void> {
  const data = Object.entries(updates)
    .filter(([k]) => k in table.index)
    .map(([k, v]) => ({
      range: `${table.tab}!${colLetter(table.index[k])}${rowNumber}`,
      values: [[v]],
    }));
  if (!data.length) return;
  await jwt().request({
    url: `${API}/${env.sheetId()}/values:batchUpdate`,
    method: "POST",
    data: { valueInputOption: "RAW", data },
  });
}

// Append a row keyed by header name; returns its 1-based row number.
export async function appendRow(
  table: Table,
  values: Record<string, string>,
): Promise<number> {
  // A tab whose header we couldn't read maps EVERY key to nothing, and Sheets
  // answers `{values:[[]]}` with a cheerful 200 that writes nothing at all. The
  // caller then carries on to the sends, so a header that moved (a stray sort is
  // enough) turns ingest into a resend loop against a table it never wrote to.
  // Fail closed instead: no header, no write, no send.
  if (!table.header.length) {
    throw new Error(
      `appendRow: tab '${table.tab}' has no header row — refusing to append (a blank/moved header means dedupe is dead)`,
    );
  }
  const row = table.header.map((h) => values[h] ?? "");
  // Every value we were handed must land somewhere. A key with no matching
  // header is silently dropped by the map above — that is how rows were appended
  // without their lead_id once the header's first cell got blanked.
  const unmapped = Object.keys(values).filter((k) => !(k in table.index));
  if (unmapped.length) {
    throw new Error(
      `appendRow: tab '${table.tab}' is missing column(s) ${unmapped.join(", ")} — refusing to append a row that would silently lose them`,
    );
  }
  const res = await jwt().request<{ updates?: { updatedRange?: string } }>({
    url: `${API}/${env.sheetId()}/values/${encodeURIComponent(table.tab)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: "POST",
    data: { values: [row] },
  });
  const rng = res.data.updates?.updatedRange ?? "";
  const m = rng.match(/!\D+(\d+):/);
  return m ? parseInt(m[1], 10) : -1;
}
