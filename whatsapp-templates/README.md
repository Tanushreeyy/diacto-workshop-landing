# WhatsApp templates — copy-paste pack (add manually in WATI)

One `.txt` per template (WA-1 … WA-8). Add each in **WATI dashboard →
Broadcast → Templates → Add Template**, then submit for Meta approval.

> **The date is now a variable — and only WA-1…WA-5 need rebuilding.** Verified live:
> all 8 templates in WATI are APPROVED with a plain-text, emoji-free header (the 🎯
> only ever lived in this local pack, never in the live template). WA-1…WA-5 hardcode
> the workshop date in the body ("17 July"), and a Meta-approved template can't be
> edited in place, so those five are rebuilt under new `…_v2` names with the date as
> **`{{2}}`**. Move the workshop with one env var — `EVENT_DATE_SHORT="Wed, 30 July"`
> — and every message updates; templates never change again.
>
> **WA-6…WA-8 are left as-is** — already approved, emoji-free, and dateless
> ("tomorrow"/"today"/"in 2 hours"). NOTE: WA-8's live name is **`wa_two_hour`** (the
> `wa_8_two_hour` template was deleted). Their `.txt` files here are documentation only.
>
> **Two ways to create the five:** copy-paste each `…_v2` `.txt` below (can't-fail),
> **or** run `node scripts/create-wa-templates.mjs` — it submits the 5 `…_v2` rebuilds
> via the **WATI API** (Bearer `WATI_ACCESS_TOKEN`, no Meta secret needed). Preview the
> exact payloads first with `--dry`. The old date-in-body WA-1…WA-5 stay live until you
> delete them; nothing sends to them once `WATI_TPL_WA1…5` point at the `…_v2` names.

> **CandidHR lead generation (`lead_capture`) is a separate, one-template pack.**
> `WA-CANDIDHR_wa_candidhr_lead_followup.txt` is the entire campaign: there is no
> event, so there is no confirmation, no pass and no reminder ladder. Submit it
> with `node scripts/create-wa-templates-candidhr.mjs --dry` to preview and drop
> `--dry` to send; regenerate the `.txt` with `--export`. Its variables are
> `{{1}}` first name · `{{2}}` demo video link, matching `waParamsFor("lead")`.
> The video rides as a **variable** rather than being baked into the body — an
> approved template cannot be edited, so a hardcoded URL would mean full
> re-approval (and stopped sends) the day the demo is re-cut. The URL button is
> static because a button URL cannot be a variable.

For each file, copy the fields into the WATI builder:

| WATI field | From the file |
|------------|---------------|
| Category | `Category` (Marketing / Utility) |
| Template name | `Template name` (lowercase + underscores) |
| Language | English (en) |
| Header | type **Text**, paste the `HEADER` line — **plain text, no emoji** |
| Body | paste the `BODY` block (keep the `{{1}} {{2}} {{3}}`) |
| Footer | paste the `FOOTER` line |
| Sample values | use the `VARIABLES / SAMPLE VALUES` samples (Meta needs them) |
| Buttons | add one **URL button** — text `Get Directions` (no emoji), static URL = the map link |

**Meta/WATI rules baked into this copy:** no emoji in the header or button text.
The body never starts or ends with a variable, and there are no two adjacent
variables. The map and support number are **static**, so the map is a static button
and the number is hardcoded — neither is a variable.

The `{{n}}` numbers **must** match what the code sends
(`lib/booking/messages.ts` → `waParamsFor`):

- **WA-1…WA-4:** `{{1}}` first name · `{{2}}` date (`Fri, 24 July`) · `{{3}}` booking link
- **WA-5:** `{{1}}` first name · `{{2}}` date · `{{3}}` Event Pass download link
- **WA-6…WA-8:** `{{1}}` first name · `{{2}}` Event Pass download link *(no date — relative time)*
- **CandidHR lead follow-up:** `{{1}}` first name · `{{2}}` demo video link *(no date, no pass)*

If you rename a template in WATI, set the matching `WATI_TPL_WA*` env var so the
code sends the right name.

> These files are generated from `scripts/create-wa-templates.mjs` via
> `npm run export-wa-templates` — edit the copy there and regenerate, don't edit
> the `.txt` by hand. The CandidHR pack comes from
> `scripts/create-wa-templates-candidhr.mjs --export` instead, because its
> header, footer and button are local to that campaign rather than the shared
> workshop constants the exporter reads.
