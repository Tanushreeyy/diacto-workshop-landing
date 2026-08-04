# The `control` tab

Every campaign is driven from one tab in its own spreadsheet. This is the tab.

The design in one line: **env holds secrets and a pointer to each campaign's
sheet; the sheet holds the campaign; code holds flow behaviour.** Running next
week's workshop is a new sheet plus one env entry — everything below is changed
by ops, in the sheet, with **no deploy and no developer**.

> **Two campaigns at once.** When more than one workshop is live, the pointer is
> `CAMPAIGN_ROUTES` rather than `SHEET_ID`, and the **host** decides which
> campaign a visitor or a lead belongs to — see `.env.example`. Each campaign
> then has **its own control tab in its own spreadsheet**, and everything in this
> document applies to each of them separately. A switch flipped in one campaign's
> control tab has no effect on the other; the same is true of the flow, the
> templates and the reminder times. There is no shared or global control tab.

Changes land on the **next tick, within 5 minutes** (`docker-compose.yml`, the
`cron` service ticks every 300s). Nothing is cached beyond that.

---

## Shape of the tab

Two columns. The header row must contain:

| accepted header (column 1) | accepted header (column 2) |
| -------------------------- | -------------------------- |
| `key` / `setting` / `name` | `value` / `enabled` / `state` |

Rules that catch people out:

- Keys are matched **lowercased and trimmed** — `Flow`, `flow` and ` flow ` are
  the same key.
- A row whose key starts with `#` is a **comment** and is ignored. Use them
  freely to section the tab.
- Row order is irrelevant. Duplicate keys: the **last** one wins.
- A blank value is not the same as a missing row for templates. See
  [Blank ≠ inherit](#blank--inherit).

---

## 1. Kill switches — these FAIL OPEN

| key | default when missing or blank | what it stops |
| --- | --- | --- |
| `ingest_enabled` | **ON** | picking up new form leads at all |
| `nurture_enabled` | **ON** | the WA-2/3/4 + EM-2/3/4 chase ladder (`self_serve` only) |
| `reminders_enabled` | **ON** | EM6-8 / WA6-8 on and around the day |
| `email_enabled` | **ON** | every email, including reminders |
| `whatsapp_enabled` | **ON** | every WhatsApp, including reminders |
| `wa_delivery_check_enabled` | **OFF** ← opposite | per-tick delivery polling (costs ~26 WATI reads/tick) |

Accepted values: **off** is `false` / `no` / `off` / `0`; **on** is `true` /
`yes` / `on` / `1`. Case-insensitive.

> **A typo reads as ON.** The test is literally "is this value one of the four
> false words" — so `FLASE`, `disabled`, `N`, `-` all leave the switch **on**.
> After changing a switch, confirm it in `/api/health` rather than trusting the
> cell.

Why fail-open: one Sheets blip must never silently kill a live campaign. A
missing switch means *no opinion, carry on*. This is the opposite of the
campaign rows below, and the asymmetry is deliberate.

---

## 2. Which tabs this campaign reads

| key | overrides | notes |
| --- | --- | --- |
| `form_tab` | `SHEET_FORM_TAB` | Meta's connector tab. Comma-separate to read two forms during a cutover. |
| `automation_tab` | `SHEET_AUTOMATION_TAB` | our working tab |
| `calling_tab` | `SHEET_CALLING_TAB` | optional; blank = not used |

A row here **wins over the env var**, so a campaign can be repointed without a
redeploy. Blank or absent leaves env authoritative.

`control` itself is **not** overridable — it is how the control tab is found, so
it cannot live inside the tab it locates. That one stays in `SHEET_CONTROL_TAB`.

---

## 3. The campaign — these FAIL CLOSED

| key | example | notes |
| --- | --- | --- |
| `flow` | `sdr_assisted` | `self_serve` or `sdr_assisted`. See below. |
| `campaign_label` | `HR Workshop — 12 Aug 2026` | shown in Slack and `/api/health` |
| `campaign_id` | `hrw` | defaults to lowercased `reg_id_prefix` |
| `reg_id_prefix` | `HRW` | prefix of every registration ID |
| `event_start_utc` | `2026-08-12T09:30:00Z` | **UTC. See the warning below.** |
| `event_date_label` | `Wednesday, 12 August 2026` | long form, used in emails |
| `event_date_short` | `Wed, 12 August` | short form, used in WhatsApp |
| `event_time_label` | `3:00 PM – 6:00 PM (Check-in from 2:30 PM)` | |
| `event_venue` | `901, B Wing, Prabhavee Tech Park, Baner, Pune` | |
| `event_map_url` | `https://maps.app.goo.gl/…` | the GET DIRECTIONS button |
| `reminder_offsets_hours` | `29,6,2` | hours **before** the start; default `29,6,2` |
| `lead_alert_number` | `917020883237` | comma-separated; blank = no WhatsApp ping to SDRs |

### ⚠️ `event_start_utc` is in UTC, not IST

This is the single most dangerous cell in the tab. **IST is UTC+5:30**, so a
3:00 PM IST workshop is `09:30:00Z`:

```
15:00 IST  =  09:30 UTC   ✅  2026-08-12T09:30:00Z
15:00 UTC  =  20:30 IST   ❌  five and a half hours late
```

Everything else is derived from it — all six reminder times, the registration
ID's date part, and the auto-stop. Get it wrong and every downstream time is
wrong in the same direction.

### Reminders are derived, never listed

`reminder_offsets_hours` is hours before the start. The default `29,6,2` is
tuned for a 15:00 IST event and lands at:

| offset | IST wall clock | keys |
| --- | --- | --- |
| −29h | 10:00 the day before | `EM6` `WA6` |
| −6h | 09:00 on the day | `EM7` `WA7` |
| −2h | 13:00 on the day | `EM8` `WA8` |

**A campaign that does not start at 15:00 IST must set its own offsets**, or
reminders land at odd hours. Verify with:

```bash
npx tsx scripts/necessity-check.mts .env.production
```

Moving the workshop is **one cell** — change `event_start_utc` and all six
reminders move with it.

---

## 4. Template names

| key | role | sent by |
| --- | --- | --- |
| `tpl_wa_booking_pending` | WA-1 booking link | `self_serve` only |
| `tpl_wa_value_nudge` | WA-2 chase | `self_serve` only |
| `tpl_wa_problem_nudge` | WA-3 chase | `self_serve` only |
| `tpl_wa_urgency_nudge` | WA-4 chase | `self_serve` only |
| `tpl_wa_confirmation` | WA-5 confirmation + pass | **every flow** |
| `tpl_wa_day_before` | WA-6 | every flow |
| `tpl_wa_morning_of` | WA-7 | every flow |
| `tpl_wa_two_hour` | WA-8 | every flow |
| `tpl_wa_lead_alert` | internal alert | every flow, if `lead_alert_number` is set |

Names must match WATI **exactly**, and be APPROVED there. `necessity-check`
verifies both against the live WATI account.

### Blank ≠ inherit

On a **managed** campaign a blank template name is an **error**, not a fallback.

A sheet is *managed* the moment any of `flow`, `event_start_utc` or
`event_date_short` has a value. From that point template names never fall back
to the env defaults.

This is not theoretical. The HR tab was seeded with `tpl_wa_two_hour` blank
while the template was still awaiting Meta approval. It silently resolved to
`wa_two_hour` — the *founder workshop's* reminder. Left alone, HR attendees
would have received a two-hour reminder for a workshop that had already
happened. Now the tick halts and says so in Slack instead.

---

## 5. `flow` — what actually changes

| | `self_serve` | `sdr_assisted` |
| --- | --- | --- |
| registration | lead books on the landing page | **the form submission IS the registration** |
| on ingest | WA-1 + EM-1 with a booking link | WA-5 + EM-5 confirmation + Event Pass |
| chase ladder | WA-2/3/4 + EM-2/3/4 until they book | none — SDRs phone them |
| `reg_id` | issued when they book | issued at ingest |
| needs `tpl_wa_booking_pending` | **yes** | no |

Setting `nurture_enabled=TRUE` on an `sdr_assisted` campaign does nothing — the
ladder is skipped by the flow, not the switch. `necessity-check` warns, because
a switch that reads ON while doing nothing is misleading.

---

## 6. Two things that stop a campaign on their own

**Auto-stop at the event.** Once `now >= event_start_utc` the tick halts
entirely — no ingest, no nurture, no reminders. Derived from the event itself so
there is no flag anyone can forget. It is silent by design: this is the normal
end of a campaign, not a fault, and it would otherwise announce itself every
five minutes.

> This guard is why last week matters. Before it existed, the finished 1 Aug
> workshop kept ingesting leads and sent **83 nudges on 3 August** inviting
> people to book a seat at an event that had already happened — roughly 46% of
> them refused by Meta, which is what degraded the number's quality rating.

**Unreadable control tab.** Fatal. The tick refuses to run rather than fall back
to a stale date, because confidently messaging people about the wrong workshop
is worse than sending nothing. Compare with the switches, which fail open.

**Anything `campaignProblems()` rejects** — bad `flow`, unparseable
`event_start_utc`, blank `event_date_label` / `event_date_short` /
`event_venue` / `reg_id_prefix`, blank `tpl_wa_confirmation`, or any blank
template on a managed campaign — halts the tick and posts the reason to Slack.
Nothing is sent. Fix the cell and the next tick resumes on its own.

---

## Checklist for a new campaign

1. New spreadsheet, with a `control` tab and the Meta connector's form tab.
2. `node scripts/init-campaign-sheet.mjs` to create the automation header.
3. Fill in the control tab — sections 1–4 above.
4. Submit the WhatsApp templates and **wait for Meta to approve them**.
   Reminders should be UTILITY where possible; MARKETING is dropped first when
   the number is quality-restricted.
5. Point `SHEET_ID` at the new sheet in `.env.production`.
6. Run the checks:
   ```bash
   node scripts/check-env.mjs .env.production      # will it boot
   npx tsx scripts/necessity-check.mts             # is everything this campaign NEEDS present
   npx tsx scripts/verify-campaign.mts             # regression suite, both campaigns
   ```
7. Deploy, then confirm with
   `curl -H "Authorization: Bearer $CRON_SECRET" https://workshop.diacto.com/api/health`.
8. Pause the previous campaign's Meta ad — no code change stops leads arriving.
