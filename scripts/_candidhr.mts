// Read-only preflight for the CandidHR campaign. Sends nothing, writes nothing.
//   npx tsx scripts/_candidhr.mts
import { readFileSync } from "fs";
for (const line of readFileSync(".env.production","utf8").split("\n")){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const { allRoutes } = await import("../lib/booking/routes.js");
const { withCampaign } = await import("../lib/booking/campaignContext.js");
const { readTable, cell, resolveHeader } = await import("../lib/booking/google.js");
const { env } = await import("../lib/booking/env.js");
const { FORM } = await import("../lib/booking/service.js");
const { loadCampaign, campaignProblems, describeCampaign, hasEnded } = await import("../lib/booking/campaign.js");

const route = allRoutes().find((r: any) => r.key === "candidhr");
if (!route) { console.error("no 'candidhr' route in CAMPAIGN_ROUTES"); process.exit(1); }

await withCampaign(route, async () => {
  const c = await loadCampaign();
  console.log("route      :", route.key, "·", route.host, "·", route.formTab);
  console.log("campaign   :", describeCampaign(c));
  console.log("flow       :", c.flow, "| managed:", c.managed);
  console.log("wa template:", c.templates.leadFollowup);
  console.log("ops alert  :", c.templates.leadAlert, "| numbers:", (await (await import("../lib/booking/control.js")).readSetting("lead_alert_number")) || "(blank → Slack only)");
  console.log("demo link  :", c.demoVideoUrl);
  console.log("hasEnded   :", hasEnded(c), "(must be false)");
  const probs = campaignProblems(c);
  console.log("problems   :", probs.length ? probs.join(" | ") : "none");

  const auto = await readTable(env.autoTab());
  const form = await readTable(route.formTab);
  console.log(`\nautomation : ${auto.rows.length} rows   form: ${form.rows.length} rows`);

  console.log("\ncolumn resolution:");
  for (const k of ["id","name","email","phone","designation","company","employeeCount","location","authority","timeline","screeningTool","adName"] as const) {
    const hit = resolveHeader(form, (FORM as any)[k]);
    console.log(`  ${hit ? "OK  " : "MISS"}  ${k.padEnd(14)} -> ${hit ?? "(none)"}`);
  }

  // Both keys the tick actually uses, not just lead_id — the phone key is what
  // catches the rows the backfill collapsed as duplicates.
  const { phoneKey } = await import("../lib/booking/phone.js");
  const knownIds = new Set((auto.rows as any[]).map(r => cell(auto, r, "lead_id")).filter(Boolean));
  const knownPhones = new Set((auto.rows as any[]).map(r => cell(auto, r, "phone_key")).filter(Boolean));
  const cId = resolveHeader(form, FORM.id)!;
  const cPhone = resolveHeader(form, FORM.phone)!;
  const unseen = (form.rows as any[]).filter(fr => {
    const id = cell(form, fr, cId);
    const ph = cell(form, fr, cPhone);
    if (!id) return false;
    if (knownIds.has(id)) return false;
    if (ph && knownPhones.has(phoneKey(ph))) return false;
    return true;
  });
  console.log(`\nform rows the next tick would ingest: ${unseen.length}`);
  for (const fr of unseen.slice(0, 5)) console.log("   row", fr.rowNumber, cell(form, fr, cId));
});
