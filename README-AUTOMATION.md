# Workshop Booking Automation

Backend that turns Meta Instant-Form leads into confirmed workshop registrations
with a personalised Event Pass, delivered over **email (M365)** and **WhatsApp
(WATI)**, tracked in a **Google Sheet**, with **Slack** notifications.

All of it plugs into this Next.js app — no separate service.

## Flow

```
Meta Instant Form ──▶ Google Sheet (source of truth)
                         │  (hourly cron tick reads new rows)
      new row ───────────┼──▶ assign token → WA-1 + EM-0a (booking link)
                         │
  landing CTA (?rid) ────┼──▶ /api/confirm → registration_complete=TRUE
      confirmed ─────────┼──▶ WA-6 + EM-1 (Event Pass PDF) + Slack
      still pending ─────┼──▶ 2×/day nurture (WA ladder + EM-0) until booked
      booked ────────────┴──▶ reminders EM-2/3/4 (+ optional WA-R1/R2)
```

- **Nurture** runs at **10:00 & 18:00 IST**, paused 22:00–09:00 IST, stops the
  instant `registration_complete` flips to TRUE.
- **Idempotent**: all state lives in the sheet (`confirm_token`, `nurture_stage`,
  `last_nudge_at`, `pass_sent_at`, `reminders_sent`), so the tick is safe to run
  twice and missed ticks self-heal on the next run.

## Sheet columns (added to `Sheet1`, after `lead_status`)

`reg_id`, `confirm_token`, `registration_complete`, `booked_at`,
`nurture_stage`, `last_nudge_at`, `pass_sent_at`, `reminders_sent`.

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in the blanks (secrets).
3. Share the Google Sheet with the service-account email as **Editor**.
4. Create the WhatsApp templates in the **WATI dashboard** (see below) and get
   them **Meta-approved**.
5. Deploy + wire the hourly cron (see below).

## WhatsApp templates (create + approve in WATI, then map names)

| Env | Default name | When | Variables |
|-----|--------------|------|-----------|
| `WATI_TPL_WA1` | `wa_1_booking_pending` | on submit | `{{1}}` first name, `{{2}}` booking link |
| `WATI_TPL_WA2` | `wa_2_value_nudge` | nurture | `{{1}}`, `{{2}}` booking link |
| `WATI_TPL_WA3` | `wa_3_problem_nudge` | nurture | `{{1}}`, `{{2}}` booking link |
| `WATI_TPL_WA4` | `wa_4_scarcity_nudge` | nurture | `{{1}}`, `{{2}}` booking link |
| `WATI_TPL_WA5` | `wa_5_final_nudge` | nurture loop | `{{1}}`, `{{2}}` booking link |
| `WATI_TPL_WA6` | `wa_6_confirmation` | on confirm | `{{1}}`, `{{2}}` pass link |
| `WATI_TPL_WAR1` | `wa_r1_morning` | day-of (opt) | `{{1}}`, `{{2}}` map link |
| `WATI_TPL_WAR2` | `wa_r2_two_hour` | day-of (opt) | `{{1}}`, `{{2}}` support |

Variable order/values live in `lib/booking/messages.ts` → `waParamsFor`. Adjust
there if you build a template with a different layout.

## Cron — pick one (the tick just needs to be called hourly)

The engine is `POST /api/cron/tick`, guarded by `CRON_SECRET`.

- **Vercel** (Pro): `vercel.json` already schedules it hourly; Vercel auto-sends
  the `Authorization: Bearer $CRON_SECRET` header.
- **VPS / Render / Railway / Fly** (free): run `npm run cron` under **pm2** or
  **systemd** (`scripts/cron.mjs`, in-process `node-cron`).
- **Any host, free external trigger**: point Cloudflare Workers Cron / GitHub
  Actions / cron-job.org at the URL with the secret header.

## Testing

```bash
# Trigger a tick manually
curl -X POST "$LANDING_BASE_URL/api/cron/tick" -H "Authorization: Bearer $CRON_SECRET"

# Confirm a booking by token (as the CTA does)
curl -X POST "$LANDING_BASE_URL/api/confirm" -H 'Content-Type: application/json' \
  -d '{"token":"<confirm_token from the sheet>"}'

# Fetch a generated pass
curl -L "$LANDING_BASE_URL/api/pass?rid=<confirm_token>" -o pass.pdf
```

## Files

```
lib/booking/
  env.ts        env access
  config.ts     workshop constants, template names, reminder schedule
  schedule.ts   IST windows / quiet hours / reminder due-checks
  google.ts     Sheets read/write (service account)
  graph.ts      M365 email send (+attachment)
  wati.ts       WhatsApp template send
  slack.ts      notifications
  pass.ts       Event Pass PDF (pdf-lib)
  messages.ts   email HTML + WhatsApp variable maps
  service.ts    orchestration (tick, confirm, pass)
app/api/
  confirm/route.ts   booking gate
  cron/tick/route.ts hourly engine
  pass/route.ts      pass PDF endpoint
components/ui/
  BookButton.tsx     CTA (token confirm or capture)
  CaptureModal.tsx   organic-visitor capture
```
