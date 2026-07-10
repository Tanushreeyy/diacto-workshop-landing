# WhatsApp templates — copy-paste pack (add manually in WATI)

One `.txt` per template (WA-1 … WA-8). Add each in **WATI dashboard →
Broadcast → Templates → Add Template**, then submit for Meta approval.

For each file, copy the fields into the WATI builder:

| WATI field | From the file |
|------------|---------------|
| Category | `Category` (Marketing / Utility) |
| Template name | `Template name` (lowercase + underscores) |
| Language | English (en) |
| Header | type **Text**, paste the `HEADER` line |
| Body | paste the `BODY` block (keep the `{{1}} {{2}} {{3}}`) |
| Footer | paste the `FOOTER` line |
| Sample values | use the `VARIABLES / SAMPLE VALUES` samples (Meta needs them) |
| Buttons | add one **URL button** — text `📍 Get Directions`, static URL = the map link |

**Meta rules baked into this copy:** the body never starts or ends with a
variable, and there are no two adjacent variables. The map and support number are
**static**, so the map is a static button and the number is hardcoded — neither
is a variable.

The `{{n}}` numbers **must** match what the code sends
(`lib/booking/messages.ts` → `waParamsFor`):

- **WA-1…WA-4:** `{{1}}` first name · `{{2}}` booking link
- **WA-5…WA-8:** `{{1}}` first name · `{{2}}` Event Pass download link

If you rename a template in WATI, set the matching `WATI_TPL_WA*` env var so the
code sends the right name.

> These files are generated from `scripts/create-wa-templates.mjs` via
> `npm run export-wa-templates` — edit the copy there and regenerate, don't edit
> the `.txt` by hand.
