// Standalone hourly cron worker for persistent hosts (VPS / Render / Railway /
// Fly) where you don't use Vercel Cron. Keep it alive with pm2 or systemd.
//   CRON_SECRET=... TICK_URL=https://your-app/api/cron/tick node scripts/cron.mjs
// On serverless (Vercel), use vercel.json crons instead — not this file.

import cron from "node-cron";

const TICK_URL = process.env.TICK_URL || "http://localhost:3000/api/cron/tick";
const CRON_SECRET = process.env.CRON_SECRET || "";

async function tick() {
  try {
    const res = await fetch(TICK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const body = await res.text();
    console.log(new Date().toISOString(), "tick", res.status, body.slice(0, 300));
  } catch (e) {
    console.error(new Date().toISOString(), "tick failed:", e);
  }
}

// Every hour, on the hour. All timing decisions (10:00/18:00 nurture, quiet
// hours, reminders) are made server-side, so the schedule can stay this simple.
cron.schedule("0 * * * *", tick);
console.log(`[cron] worker started — hourly tick → ${TICK_URL}`);
tick(); // run once on boot
