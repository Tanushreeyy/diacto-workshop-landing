import { readFileSync, writeFileSync } from "fs";
for (const line of readFileSync(".env.production","utf8").split("\n")){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
import { JWT } from "google-auth-library";
const { allRoutes } = await import("../lib/booking/routes.js");
const route = allRoutes().find((r:any)=>r.key==="founder")!;
const APPLY = process.argv.includes("--apply");
const OUT = "/tmp/claude-1000/-home-yash-diacto-wl/6063cb92-df20-4ffe-ad84-1856cfa74dd2/scratchpad";
const L = (i:number):string => (i<26 ? String.fromCharCode(65+i) : L(Math.floor(i/26)-1)+String.fromCharCode(65+(i%26)));

const c = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY||"").replace(/\\n/g,"\n"),
  scopes:["https://www.googleapis.com/auth/spreadsheets"],
});
const API = `https://sheets.googleapis.com/v4/spreadsheets/${route.sheetId}`;
const get = async (r:string) => ((await c.request<any>({url:`${API}/values/${encodeURIComponent(r)}`})).data.values ?? []);

const v = await get(`${route.formTab}!A1:AZ3`);
const [r1, r2, r3] = [v[0]||[], v[1]||[], v[2]||[]];

writeFileSync(`${OUT}/header-backup.json`, JSON.stringify({tab:route.formTab, sheetId:route.sheetId, capturedAt:new Date().toISOString(), row1:r1, row2:r2, row3:r3}, null, 2));
console.log(`backup: ${OUT}/header-backup.json`);

const fail = (m:string) => { throw new Error(`GUARD FAILED — ${m}. Sheet changed since diagnosis; aborting WITHOUT writing.`); };
if (!/^l:\d+$/.test(r1[0]||"")) fail(`row1 A = ${JSON.stringify(r1[0])}, expected a lead id`);
if ((r1[20]||"") !== "id") fail(`row1 U = ${JSON.stringify(r1[20])}, expected "id"`);
if ((r1[37]||"") !== "whatsapp_number") fail(`row1 AL = ${JSON.stringify(r1[37])}, expected "whatsapp_number"`);
if ((r2[0]||"") !== "") fail(`row2 A = ${JSON.stringify(r2[0])}, expected empty`);
if ((r2[1]||"") !== "created_time") fail(`row2 B = ${JSON.stringify(r2[1])}, expected "created_time"`);
if ((r2[28]||"") !== "id") fail(`row2 AC = ${JSON.stringify(r2[28])}, expected the orphaned "id"`);
if (!/^l:\d+$/.test(r3[0]||"")) fail(`row3 A = ${JSON.stringify(r3[0])}, expected a data row`);
console.log("guards passed — sheet is in the diagnosed state\n");

// Canonical header = row 2's labels (B..AB already sit over the right columns)
// with "id" restored to column A, where the lead id actually lives.
const HEADER = ["id", ...r2.slice(1, 28)];
const STRAY  = r1.slice(0, 20);   // the lead trapped inside the header row

// Overwrite the FULL width. readTable's index is last-wins, so a leftover
// "full_name" at AK would silently re-point the map past the end of the data.
const WIDTH = 52;
const pad = (a:string[]) => [...a, ...Array(Math.max(0, WIDTH-a.length)).fill("")];

console.log("ROW 1 becomes the header:");
HEADER.forEach((h,i)=>console.log(`   ${L(i).padEnd(2)} ${h}`));
console.log(`\nROW 2 becomes a data row — the lead currently trapped in the header:`);
console.log(`   id=${STRAY[0]}  name=${STRAY[16]}  phone=${STRAY[17]}  email=${STRAY[18]}  lead_status=${STRAY[19]}`);
console.log(`\nrows 3+ untouched (next is ${r3[0]} / ${r3[16]})`);

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); process.exit(0); }

await c.request({
  url: `${API}/values:batchUpdate`, method: "POST",
  data: { valueInputOption: "RAW", data: [
    { range: `${route.formTab}!A1:AZ1`, values: [pad(HEADER)] },
    { range: `${route.formTab}!A2:AZ2`, values: [pad(STRAY)] },
  ]},
});
console.log("\n✓ written");
