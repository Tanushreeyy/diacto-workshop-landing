import { readFileSync } from "fs";
for (const line of readFileSync(".env.production","utf8").split("\n")){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
delete process.env.CAMPAIGN_ROUTES;
process.env.SHEET_ID="1qt-4O2Z0XiUetYitGd4aAVr60FPnH5XKgG1nhMT5IZ8";
const { readTable, cell, resolveHeader } = await import("../lib/booking/google.js");
const t = await readTable(process.env.CONTROL_TAB || "control");
const cK = resolveHeader(t,["key","setting","name"])!, cV = resolveHeader(t,["value","enabled","state"])!;
console.log("header:", JSON.stringify(t.header));
for (const r of t.rows) console.log(String(r.rowNumber).padStart(3), (cell(t,r,cK)||"").padEnd(28), JSON.stringify(cell(t,r,cV)));
