import { readFileSync } from "fs";
for (const line of readFileSync(".env.production","utf8").split("\n")){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const SHEET="1qt-4O2Z0XiUetYitGd4aAVr60FPnH5XKgG1nhMT5IZ8", TAB="control";
const { JWT } = await import("google-auth-library");
const c = new JWT({ email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: (process.env.GOOGLE_PRIVATE_KEY||"").replace(/\\n/g,"\n"), scopes:["https://www.googleapis.com/auth/spreadsheets"] });
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET}`;
const rd = async (r:string) => (await c.request<{values?:string[][]}>({url:`${API}/values/${encodeURIComponent(r)}`})).data.values ?? [];

// GUARDS — abort without writing if the tab is not what we diagnosed.
const cur = await rd(`${TAB}!A14:B17`);
const want: [number,string,string][] = [
  [0,"campaign_label","Business Transformation Blueprint — 8 Aug 2026"],
  [2,"event_date_label","Saturday, 8 August 2026"],
  [3,"event_date_short","Sat, 8 August"],
];
for (const [i,k,v] of want) {
  if ((cur[i]?.[0]||"") !== k) throw new Error(`GUARD FAILED — row ${14+i} key = ${JSON.stringify(cur[i]?.[0])}, expected ${k}. Aborting WITHOUT writing.`);
  if ((cur[i]?.[1]||"") !== v) throw new Error(`GUARD FAILED — row ${14+i} value = ${JSON.stringify(cur[i]?.[1])}, expected ${JSON.stringify(v)}. Aborting WITHOUT writing.`);
}
console.log("backup:", JSON.stringify(cur));

await c.request({ url:`${API}/values:batchUpdate`, method:"POST", data:{ valueInputOption:"RAW", data:[
  { range:`${TAB}!B14`, values:[["Business Transformation Blueprint — 15 Aug 2026"]] },
  { range:`${TAB}!B16`, values:[["Saturday, 15 August 2026"]] },
  { range:`${TAB}!B17`, values:[["Sat, 15 August"]] },
]}});

const after = await rd(`${TAB}!A14:B22`);
for (const r of after) if (r?.[0]) console.log(" ", (r[0]||"").padEnd(20), JSON.stringify(r[1]||""));
