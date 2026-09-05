import { readFileSync } from "fs";
for (const line of readFileSync(".env.production","utf8").split("\n")){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const { allRoutes } = await import("../lib/booking/routes.js");
const { withCampaign } = await import("../lib/booking/campaignContext.js");
const { readTable, cell, resolveHeader } = await import("../lib/booking/google.js");
const { env } = await import("../lib/booking/env.js");
const { FORM } = await import("../lib/booking/service.js");
const { phoneKey } = await import("../lib/booking/phone.js");
const isTestLead = (n:string,e:string,p:string)=> e.toLowerCase()==="test@meta.com" || n.includes("<test") || p.includes("<test");
const route = allRoutes().find((r:any)=>r.key==="founder")!;

await withCampaign(route, async () => {
  const auto = await readTable(env.autoTab());
  const form = await readTable(route.formTab);
  const knownIds = new Set((auto.rows as any[]).map(r=>cell(auto,r,"lead_id")).filter(Boolean));
  const knownPhones = new Set((auto.rows as any[]).map(r=>cell(auto,r,"phone_key")).filter(Boolean));

  const cId=resolveHeader(form,FORM.id)!, cName=resolveHeader(form,FORM.name)!,
        cEmail=resolveHeader(form,FORM.email)!, cPhone=resolveHeader(form,FORM.phone)!;

  const reasons: Record<string, any[]> = {};
  const add=(k:string,v:any)=>{(reasons[k]=reasons[k]||[]).push(v)};

  for (const fr of form.rows as any[]) {
    const leadId=cell(form,fr,cId), name=cell(form,fr,cName),
          email=cell(form,fr,cEmail), phone=cell(form,fr,cPhone);
    if (knownIds.has(leadId)) continue;                       // already ingested — fine
    const tag = `row ${fr.rowNumber} ${String(name).slice(0,20).padEnd(20)} ${phone}`;
    if (!leadId)                       { add("no lead_id", tag); continue; }
    if (!email && !phone)              { add("no email AND no phone", tag); continue; }
    if (phone && knownPhones.has(phoneKey(phone))) {
      const dupe=(auto.rows as any[]).find(r=>cell(auto,r,"phone_key")===phoneKey(phone));
      add("DUPLICATE phone_key (already a lead)", `${tag}  -> auto row ${dupe?.rowNumber} ${dupe?cell(auto,dupe,"name"):""}`);
      continue;
    }
    if (isTestLead(name,email,phone))  { add("test lead", tag); continue; }
    add("SHOULD HAVE BEEN INGESTED", tag);
  }
  console.log(`automation=${auto.rows.length}  form=${form.rows.length}\n`);
  for (const [k,v] of Object.entries(reasons)) {
    console.log(`=== ${k}: ${v.length} ===`);
    for (const x of v.slice(0,45)) console.log(`   ${x}`);
    console.log("");
  }
});
