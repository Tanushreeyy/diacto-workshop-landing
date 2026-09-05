import { readFileSync } from "fs";
for (const line of readFileSync(".env.production","utf8").split("\n")){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
delete process.env.CAMPAIGN_ROUTES;
process.env.SHEET_ID="1qt-4O2Z0XiUetYitGd4aAVr60FPnH5XKgG1nhMT5IZ8";
const { readTable, cell } = await import("../lib/booking/google.js");
const a = await readTable("automation");
let reg=0, unreg=0, unregLive=0, regFullRem=0, opted=0;
const stat:Record<string,number>={};
for (const r of a.rows) {
  if (!cell(a,r,"confirm_token")) continue;
  const s=(cell(a,r,"status")||"").trim().toLowerCase();
  stat[s||"(blank)"]=(stat[s||"(blank)"]||0)+1;
  const done=(cell(a,r,"registration_complete")||"").trim().toUpperCase()==="TRUE";
  if (done) { reg++; const rem=cell(a,r,"reminders_sent")||""; if(["EM6","WA6","EM7","WA7","EM8","WA8"].every(k=>rem.includes(k))) regFullRem++; }
  else { unreg++; if(!s||s==="new") unregLive++; }
}
console.log({total:a.rows.length, registered:reg, registeredWithAllRemindersBurned:regFullRem, unregistered:unreg, unregisteredNotOptedOut:unregLive});
console.log("status:", stat);
