import { readFileSync } from "fs";
for (const line of readFileSync(".env.production","utf8").split("\n")){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
delete process.env.CAMPAIGN_ROUTES;
process.env.SHEET_ID="1qt-4O2Z0XiUetYitGd4aAVr60FPnH5XKgG1nhMT5IZ8";
const { readTable, cell, resolveHeader } = await import("../lib/booking/google.js");
const { FORM } = await import("../lib/booking/service.js");
const a=await readTable("automation"), f=await readTable("Saturday_Workshop");
const ids=new Set(a.rows.map(r=>cell(a,r,"lead_id")).filter(Boolean));
const idc=resolveHeader(f,FORM.id as any)!;
const pend=f.rows.filter(r=>{const v=cell(f,r,idc);return v&&!ids.has(v);}).length;
const bad=a.rows.filter(r=>cell(a,r,"status")==="invalid_number").length;
console.log(`${new Date().toISOString().slice(11,19)}Z  automation=${a.rows.length}  form=${f.rows.length}  pending=${pend}  invalid=${bad}`);
