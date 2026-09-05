import { readFileSync } from "fs";
for (const line of readFileSync(".env.production","utf8").split("\n")){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const { allRoutes } = await import("../lib/booking/routes.js");
const { withCampaign } = await import("../lib/booking/campaignContext.js");
const { readTable, cell } = await import("../lib/booking/google.js");
const { env } = await import("../lib/booking/env.js");
const route = allRoutes().find((r:any)=>r.key==="founder")!;
await withCampaign(route, async () => {
  const t = await readTable(env.autoTab());
  // rows created since the header repair (11:33Z today)
  const CUT = "2026-08-07T11:30:00";
  const fresh = (t.rows as any[]).filter(r => cell(t,r,"created_at") > CUT);
  console.log(`rows ingested since the repair: ${fresh.length}\n`);
  const st: Record<string,number> = {};
  for (const r of fresh) { const s = cell(t,r,"status")||"(blank=ok)"; st[s]=(st[s]||0)+1; }
  console.log("status breakdown:", JSON.stringify(st));
  console.log("\nsample (name | phone | nurture_stage | last_nudge_at | promo_today | status):");
  for (const r of fresh.slice(0,12)) {
    console.log(`  ${cell(t,r,"name").slice(0,22).padEnd(22)} ${cell(t,r,"phone").padEnd(14)} stage=${cell(t,r,"nurture_stage")} nudge=${cell(t,r,"last_nudge_at").slice(11,19)} promo=${cell(t,r,"promo_today")} ${cell(t,r,"status")}`);
  }
  const noNudge = fresh.filter(r=>!cell(t,r,"last_nudge_at"));
  console.log(`\nrows with NO last_nudge_at (welcome never attempted): ${noNudge.length}`);
  for (const r of noNudge.slice(0,10)) console.log(`   row ${r.rowNumber} ${cell(t,r,"name")} ${cell(t,r,"phone")} status=${cell(t,r,"status")}`);
});
