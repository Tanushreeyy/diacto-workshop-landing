// Google Sheets access via a service account (read + write proven live).
// Uses google-auth-library for RS256/JWT auth and the Sheets REST API for I/O.

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
  header: string[];
  index: Record<string, number>; // header name -> 0-based column
  rows: SheetRow[];
}

export function cell(table: Table, row: SheetRow, header: string): string {
  const i = table.index[header];
  return i === undefined ? "" : row.cells[i] ?? "";
}

export async function readTable(): Promise<Table> {
  const tab = env.sheetTab();
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
  return { header, index, rows };
}

// Update named columns on a specific sheet row.
export async function updateRow(
  rowNumber: number,
  table: Table,
  updates: Record<string, string>,
): Promise<void> {
  const tab = env.sheetTab();
  const data = Object.entries(updates)
    .filter(([k]) => k in table.index)
    .map(([k, v]) => ({
      range: `${tab}!${colLetter(table.index[k])}${rowNumber}`,
      values: [[v]],
    }));
  if (!data.length) return;
  await jwt().request({
    url: `${API}/${env.sheetId()}/values:batchUpdate`,
    method: "POST",
    data: { valueInputOption: "RAW", data },
  });
}

// Append a new lead row keyed by header name; returns its 1-based row number.
export async function appendRow(
  table: Table,
  values: Record<string, string>,
): Promise<number> {
  const tab = env.sheetTab();
  const row = table.header.map((h) => values[h] ?? "");
  const res = await jwt().request<{ updates?: { updatedRange?: string } }>({
    url: `${API}/${env.sheetId()}/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: "POST",
    data: { values: [row] },
  });
  const rng = res.data.updates?.updatedRange ?? "";
  const m = rng.match(/!\D+(\d+):/);
  return m ? parseInt(m[1], 10) : -1;
}
