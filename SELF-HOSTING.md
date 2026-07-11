# Self-hosting guide

The workshop landing page + booking automation. It is a standard **Next.js** app
with no vendor lock-in: no serverless-only APIs, no platform SDKs, no database.
All state lives in a **Google Sheet**. It runs anywhere Node 20 runs.

---

## 1. What it does

```
Meta Instant Form (name · phone · email)
        │  connector writes to the form tab of the sheet
        ▼
  POST /api/cron/tick   (called every ~5 min by any scheduler)
        │  copies new leads into the automation tab, sends WA-1 + EM-1
        │  with a tokenised registration link
        ▼
  Landing page → registration form → POST /api/register
        │  writes the registration, generates a personalised Event Pass PDF,
        │  sends WA-5 + EM-5 (pass attached), pings Slack
        ▼
  Reminders (day before · morning of · 2h before) — also driven by the tick
```

Anyone who does not finish the form gets nudged twice a day (10:00 & 17:00 IST)
on WhatsApp **and** email until they do.

## 2. Requirements

- **Node 20+** (or Docker)
- **Outbound HTTPS** to `graph.microsoft.com`, `sheets.googleapis.com`,
  `login.microsoftonline.com`, your WATI host, `hooks.slack.com`
- **A public HTTPS URL.** Non-negotiable: the Event Pass link we send by
  WhatsApp/email must be fetchable by the recipient, and WhatsApp will not open
  an untrusted certificate.
- **Something that can call one URL on a schedule** (see §6)

No database. No Redis. No queue.

## 3. Run it

### Docker (recommended — zero assumptions about the host)

```bash
cp .env.example .env.production   # then fill it in (see §4)
docker compose up -d --build
```

`docker-compose.yml` also starts a **cron sidecar** that calls the tick every 5
minutes, so you do not need a scheduler on the host. If you already have one,
delete the `cron` service and use your own (see §6).

### Plain Node

```bash
npm ci
npm run build
node .next/standalone/server.js     # listens on :3000
```

Keep it alive with **systemd** or **pm2**, and put a reverse proxy in front of
it for TLS. With Caddy that is the entire config:

```caddy
workshop.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy obtains and renews the certificate automatically. Ports **80 and 443** must
be open (80 is required for the ACME challenge).

## 4. Configuration

Copy `.env.example` and fill it in. Every value is documented there. The ones
that must be correct or nothing works:

| Variable | Notes |
|---|---|
| `LANDING_BASE_URL` | **The public HTTPS origin, no trailing slash.** Every booking and Event Pass link we send is built from this. If it is wrong, every link we send is dead. |
| `SHEET_ID` | The Google Sheet holding the leads |
| `SHEET_FORM_TAB` | Tab the Meta connector writes to (we only ever **read** it) |
| `SHEET_AUTOMATION_TAB` | Tab we own — all booking state lives here |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` | Service account. **The sheet must be shared with that email as Editor** — this is the single most common setup mistake. |
| `AZURE_*` / `GRAPH_SENDER_UPN` | Sends email as the workshop mailbox. Needs `Mail.Send` **application** permission, scoped to that one mailbox by an Application Access Policy. |
| `WATI_API_ENDPOINT` / `WATI_ACCESS_TOKEN` | WhatsApp. Template names are overridable via `WATI_TPL_WA*`. |
| `CRON_SECRET` | Shared secret for the tick + health endpoints. Generate with `openssl rand -hex 24`. |
| `EVENT_START_UTC` | **Drives all three reminders.** Change this one value and the day-before / morning-of / 2-hours-before reminders all move with it. |
| `TICK_BUDGET_MS` | How long one tick may work before stopping and leaving the rest for the next run (default 8000). Keeps you under a serverless function timeout. Raise it freely on a long-running host. |

## 5. Verify the deployment before you trust it

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-host>/api/health
```

Checks the env, reads the sheet, gets a Microsoft Graph token, authenticates to
WATI (and reports how many templates are approved), and confirms Slack. Returns
`200` when everything is wired, `503` with the specific failure when it is not.

**Do this first.** It turns a silent misconfiguration into a one-line answer.

## 6. The scheduler

**Exactly one endpoint needs to be called on a schedule:**

```
POST /api/cron/tick
Authorization: Bearer <CRON_SECRET>
```

Call it **every 5 minutes**. All timing logic (the 10:00/17:00 IST nurture slots,
quiet hours, reminder times) lives **inside the app** — the caller needs no
knowledge of the schedule and no timezone handling. The call is **idempotent**:
extra calls do nothing, and a missed call is picked up by the next one.

Any of these work:

- `docker compose` — the included `cron` sidecar (nothing else to set up)
- **crontab**: `*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/tick`
- **Kubernetes CronJob**, **systemd timer**, **GitHub Actions**, **cron-job.org**, a Cloudflare Worker — all equivalent

> If the tick stops running, nothing is lost — but nothing is *sent*. No
> registration links, no nudges, no reminders. It is the heartbeat.

## 7. The endpoints

| Endpoint | Auth | Called by |
|---|---|---|
| `POST /api/cron/tick` | `CRON_SECRET` | your scheduler |
| `GET /api/health` | `CRON_SECRET` | you, after deploying |
| `POST /api/register` | none (public) | the landing-page form |
| `POST /api/lookup` | none (public) | the landing page, to prefill a known lead |
| `GET /api/pass?rid=…` | token in the URL | the attendee, from their WhatsApp/email link |

`/api/pass` is deliberately public and token-gated: WhatsApp and email clients
fetch it unauthenticated, so it cannot sit behind a login.

## 8. The sheet

Two tabs:

- **form tab** — written by the Meta connector. **We only read it.** Column names
  are resolved flexibly (`full_name` / `your_name:` / `name`, etc.), so a change
  to the Meta form will not break ingestion.
- **automation tab** — ours. Every column is listed in `lib/booking/service.ts`.
  Deliberately kept on a *separate* tab so a Meta form change can never shift or
  clobber booking state.

Nothing else persists anywhere. Back up the sheet and you have backed up the system.

## 9. Operational notes

- **Idempotent throughout.** `confirm_token`, `registration_complete`,
  `pass_sent_at` and `reminders_sent` mean nothing is ever sent twice, and a
  partial run is always safe to resume.
- **Quiet hours** — no nurture between 22:00 and 09:00 IST.
- **Slack** gets a message on every event: new lead, each nudge, each
  registration, each reminder, and any failure.
- **Sends fail soft.** If WhatsApp fails (e.g. a template is not approved), the
  email still goes out, the registration is still recorded, and Slack reports
  which channel failed. A lead is never lost because one channel is down.
- **Event Pass PDFs are generated on demand**, never stored. `/api/pass`
  regenerates from the sheet each time.

## 10. Credentials — what to swap at handover

Most of these are already yours (the Microsoft tenant, the WATI account). Two are
worth an explicit decision:

| Credential | Owner | Action |
|---|---|---|
| `AZURE_*`, `GRAPH_SENDER_UPN` | Yours | Nothing to do |
| `WATI_*` | Yours | Nothing to do |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` | Service account in a GCP project owned by **SalesUp**. It has **no permissions beyond the one shared sheet**. | Keep it, or create your own service account (GCP → Service Accounts → JSON key) and share the sheet with its email as **Editor**. Swap the two env vars; nothing else changes. |
| `SLACK_WEBHOOK_URL` | Points at a **SalesUp** channel (write-only, that one channel) | Replace with your own webhook, or **leave it unset** — Slack is optional and the app runs fine without it. |
| `CRON_SECRET` | — | **Generate a fresh one** (`openssl rand -hex 24`) and update both the app env and your scheduler. |

Rotating any of these is just an env change plus a restart. No code touches them.

## 11. Changing the workshop

To run a different event, no code change is needed:

```bash
EVENT_START_UTC=2026-09-11T09:30:00Z     # everything else derives from this
EVENT_DATE_LABEL=Friday, 11 September 2026
EVENT_TIME_LABEL=3:00 PM – 6:00 PM  (Check-in from 2:30 PM)
EVENT_VENUE=...
EVENT_MAP_URL=...
EVENT_MMDD=0911                          # appears in the Registration ID
REG_ID_PREFIX=HPT
```

Email bodies live in `email-templates/*.html` — edit them and run
`npm run build-emails`. WhatsApp copy lives in `whatsapp-templates/` and must be
re-approved by Meta whenever it changes.
