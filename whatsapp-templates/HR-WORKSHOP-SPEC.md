# HR Workshop — WhatsApp + Email templates (submission spec)

**Event:** Wednesday, 12 August 2026 · 3:00–6:00 PM IST (check-in 2:30 PM)
**Venue:** 901, B Wing, Prabhavee Tech Park, Baner, Pune
**Prepared:** 2026-08-01 · Anveshika's copy with agreed corrections applied

---

## ⚠️ ALL FOUR MUST BE SUBMITTED AS **UTILITY**, NOT MARKETING

Measured on this WhatsApp number on 1 Aug 2026, the day Meta quality-restricted it:

| Category | Sent | Failed |
|---|---|---|
| UTILITY | 30 | **0** |
| MARKETING | 36 | **25 (41%)** |

Nine registered attendees silently missed their 2-hour reminder purely because
`wa_two_hour` was categorised MARKETING. A confirmation and event reminders sent
to someone who has already registered are transactional.

**A template's category cannot be changed after approval.** Getting this wrong
means rebuilding and re-approving from scratch — the multi-day wait that is
already the critical path.

---

## Corrections applied to the draft

| # | Issue | Fix |
|---|---|---|
| 1 | Header `🎯 A FREE PRACTICAL…` = **61 chars** (limit 60), and WATI rejects header emojis | Emoji dropped → 59 chars |
| 2 | WA-8 body opened on a variable (`{{First Name}}, the…`) — Meta rejects | Opens on text |
| 3 | Date hardcoded in body | Date is now `{{2}}` on WA-5, so a postponement is an env change, not a re-approval |
| 4 | `{{Map Link}}` as a body variable, though the venue is identical for everyone | Static **Get Directions** URL button, matching the existing approved templates |
| 5 | "Your Event Pass is in your email" | Pass now a tap-to-open PDF link in the message |
| 6 | Venue missing unit number | Full address: 901, B Wing |
| 7 | Mojibake (`��`) in several lines | Cleaned |
| 8 | EM-7 said "weekday **evening** traffic" for a 3 PM event | "afternoon" |
| 9 | EM-5 said "confirmed" then "we'll call to confirm your attendance" | Reworded so it doesn't contradict itself |

---

## Variable contract — matches existing code, no change needed

`lib/booking/messages.ts → waParamsFor` already maps exactly this:

- **WA-5** carries the date: `{{1}}` first name · `{{2}}` date · `{{3}}` pass link
- **WA-6/7/8** are relative ("tomorrow", "today", "in 2 hours"), so no date:
  `{{1}}` first name · `{{2}}` pass link

The support number and map link are **static text/button**, not variables.

The pass link resolves to `/api/pass?rid=<token>`, which returns the PDF directly
(`Content-Type: application/pdf`). Tapping it opens the pass — it does **not**
route to the landing page.

Every body below: opens on text, never ends on a variable, no two adjacent
variables, header is plain text with no emoji.

---

# WhatsApp

**Header (all four, plain text, 59 chars):**
```
A FREE PRACTICAL WORKSHOP FOR HR MANAGERS, TA HEADS & CHROs
```
**Footer (all four):** `Diacto Technologies`
**Button (all four):** URL · static · `Get Directions` → venue map link

---

## WA-5 · Registration confirmation — sent at ingest · **UTILITY**

```
Congratulations {{1}}! Your seat for the Free Practical Workshop for HR Managers, TA Heads & CHROs is CONFIRMED. 🎉

🗓 {{2}}  |  🕒 3:00 PM – 6:00 PM (check-in from 2:30 PM)
📍 901, B Wing, Prabhavee Tech Park, Baner, Pune

🎫 Your Event Pass (PDF): {{3}}

Carry it (digital or print) for entry. Our team will call you shortly to confirm your attendance. Tap "Get Directions" below for the venue map. See you there! 🚀
```
Samples: `{{1}}` Priya · `{{2}}` Wed, 12 August · `{{3}}` https://workshop.diacto.com/api/pass?rid=abc123

---

## WA-6 · One day before · **UTILITY**

```
Hi {{1}}! Tomorrow at 3:00 PM — the Free Practical Workshop for HR Managers, TA Heads & CHROs, at 901, B Wing, Prabhavee Tech Park, Baner, Pune.

🎫 Your Event Pass: {{2}}

Check-in opens 2:30 PM. Tap "Get Directions" below for the venue map. See you there! 🚀
```

---

## WA-7 · Morning of the event · **UTILITY**

```
Good morning {{1}}! The Free Practical Workshop for HR Managers, TA Heads & CHROs is today at 3:00 PM — doors open 2:30 PM, at 901, B Wing, Prabhavee Tech Park, Baner, Pune.

🎫 Your Event Pass: {{2}}

Weekday traffic in Baner can be slow — please leave early. See you soon! ✅
```

---

## WA-8 · Two hours before · **UTILITY**

```
Hi {{1}}, the Free Practical Workshop for HR Managers, TA Heads & CHROs goes live in 2 hours — 3:00 PM sharp, at 901, B Wing, Prabhavee Tech Park, Baner, Pune. ⏳

🎫 Show your Event Pass at check-in: {{2}}

Need help finding us? Call +91 7387731069. Tap "Get Directions" below for the map. 🚀
```

---

# Email

Built from `email-templates/*.html` via `npm run build-emails`. Available
placeholders (see `messages.ts`): `First_Name`, `Event_Date`, `Event_Date_Short`,
`Map_Link`, `Support_Number`, `Updated_Pass_Link`, `Unsubscribe_Link`.

The Event Pass PDF is **genuinely attached** to EM-5 and re-attached to
EM-6/7/8 — verified in `service.ts:879-888` — so "attached to this email" is
accurate copy.

> ⚠️ **Every email must keep `{{Unsubscribe_Link}}` in the footer.** Anveshika's
> draft has no unsubscribe line. It is a one-click tokenised opt-out and the only
> thing that stops a recipient having to reply to be left alone. Dropping it
> harms deliverability on a domain that is already under a quality restriction.

| Template | When | Subject |
|---|---|---|
| EM-5 | at ingest, with pass | Free Practical Workshop for HR Managers, TA Heads & CHROs \| ✅ Confirmed! Your Event Pass is here (Wed, 12 Aug) |
| EM-6 | day before | … \| ⏰ Tomorrow, 3 PM — Baner, Pune |
| EM-7 | morning of | … \| 🚀 Today at 3 PM, {{First_Name}} — see you in Baner |
| EM-8 | 2 hours before | … \| ⏳ Starting in 2 hours — 3:00 PM, Baner |

Body copy is Anveshika's as written, with:
- venue → `901, B Wing, Prabhavee Tech Park, Baner, Pune`
- support number → `+91 7387731069` (EM-6, EM-7, EM-8 footers; EM-8 "running late" line)
- EM-7 "weekday **evening** traffic" → "afternoon traffic"
- EM-5 "our team will call you shortly to confirm your attendance" kept, but the
  opening changed from "officially confirmed" to "your seat is reserved" so the
  two lines don't contradict
- `{{Unsubscribe_Link}}` added to every footer

---

## Submission checklist

- [ ] All four submitted as **UTILITY**
- [ ] Headers plain text, no emoji, ≤60 chars
- [ ] Static `Get Directions` button on all four
- [ ] Sample values supplied for every variable (Meta rejects without them)
- [ ] Venue reads `901, B Wing, …` everywhere
- [ ] No mojibake
- [ ] Once approved, set `tpl_wa_confirmation` / `tpl_wa_reminder` / WA-7 / WA-8
      in the new sheet's control tab
