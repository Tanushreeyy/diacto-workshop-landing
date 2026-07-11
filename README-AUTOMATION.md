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

Every template has a static **📍 Get Directions** URL button (map link); the map
and support number are static, so they are not variables.

| Env | Default name | When | Body variables |
|-----|--------------|------|----------------|
| `WATI_TPL_WA1` | `wa_1_booking_pending` | instant ack | `{{1}}` first name · `{{2}}` booking link |
| `WATI_TPL_WA2` | `wa_2_value_nudge` | nurture touch 1 | `{{1}}` · `{{2}}` booking link |
| `WATI_TPL_WA3` | `wa_3_problem_nudge` | nurture touch 2 | `{{1}}` · `{{2}}` booking link |
| `WATI_TPL_WA4` | `wa_4_urgency_nudge` | nurture, repeats 2×/day | `{{1}}` · `{{2}}` booking link |
| `WATI_TPL_WA5` | `wa_5_confirmation` | on confirm | `{{1}}` first name · **Document header** = Event Pass PDF |
| `WATI_TPL_WA6` | `wa_6_day_before` | 1 day before | `{{1}}` · `{{2}}` Event Pass link |
| `WATI_TPL_WA7` | `wa_7_morning_of` | morning of | `{{1}}` · `{{2}}` Event Pass link |
| `WATI_TPL_WA8` | `wa_8_two_hour` | 2 hours before | `{{1}}` · `{{2}}` Event Pass link |

Nurture cadence: **WA-2** at the first 10:00/17:00 IST slot, **WA-3** next slot,
then **WA-4** twice daily (10:00 & 17:00) until booked. Quiet hours 22:00–09:00.
Body-variable order/values live in `lib/booking/messages.ts` → `waParamsFor`.

### Auto-creating the templates (optional)

WATI's API can't create templates, but Meta's WhatsApp Business Management API
can — and they then appear in WATI (same WABA). `scripts/create-wa-templates.mjs`
creates all 8 in one run:

```bash
META_ACCESS_TOKEN=<system-user token w/ whatsapp_business_management> \
META_WABA_ID=1014712724510403 \
npm run create-templates
```

Get the token from Meta **Business Settings → System Users** (assign the WhatsApp
account asset). Works only if the WABA is in your Business Manager; otherwise
create them in the WATI dashboard. Meta still reviews for approval either way.

## Cron — one endpoint, called by an external scheduler

The engine is **`POST /api/cron/tick`**, guarded by `CRON_SECRET`. It is the only
endpoint that needs a cron. Everything time-related (10:00/17:00 IST nurture
slots, quiet hours, reminder times) is decided **inside the app**, so the caller
just knocks periodically — it needs no knowledge of the schedule. The tick is
idempotent, so extra calls are harmless and missed calls self-heal.

**Call it every 5–10 minutes** (not hourly): new leads then get their WA-1 + EM-1
acknowledgement within minutes instead of up to an hour. Nurture/reminders still
only fire when actually due.

**Default: GitHub Actions** — `.github/workflows/cron-tick.yml` (already in the
repo). Set two repo secrets under *Settings → Secrets and variables → Actions*:

| Secret | Value |
|---|---|
| `TICK_URL` | `https://<your-domain>/api/cron/tick` |
| `CRON_SECRET` | same value as the app's `CRON_SECRET` env var |

> GitHub only runs scheduled workflows from the **default branch**, so this must
> be merged to `main` before the schedule fires. Use **Run workflow** to test.
> GitHub's scheduler is best-effort and can lag several minutes — fine here,
> since the app catches up on the next tick.

**Alternatives** (any one, same single call):
- **cron-job.org / Cloudflare Workers Cron** — more punctual than GitHub; just
  POST the URL with the `Authorization: Bearer <CRON_SECRET>` header.
- **VPS / Render / Railway / Fly** — `npm run cron` (in-process `node-cron`,
  `scripts/cron.mjs`) under **pm2** or **systemd**.
- **Vercel Cron** — removed on purpose, to avoid double-firing alongside the
  external caller. Re-add a `crons` block to `vercel.json` only if you drop the
  external scheduler.

```bash
# what any of them do, once every 5 minutes:
curl -fsS -X POST "$TICK_URL" -H "Authorization: Bearer $CRON_SECRET"
```

### The other endpoints are NOT cron — they're user-triggered
- `POST /api/confirm` — the landing-page CTA (browser)
- `GET /api/pass?rid=<token>` — the attendee tapping their pass link

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
