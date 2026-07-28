# Prod migration — add "Years in business" to the pipeline

## STATUS: ✅ sheet steps 1 & 2 DONE on 2026-07-28
A FRESH prod `automation` tab was created (28-col schema INCLUDING `years_in_business`,
matching staging) and the `control` tab's `automation_header` baseline was updated to
match. What remains is the CODE deploy + env (see BTB_PROD_FLIP.env-snippet, applied).

## 1. Add the column to the prod `automation` tab  ✅ DONE
Done via a fresh `automation` tab carrying `years_in_business` as its 28th column
(the old July tab is archived as `automation_OLD_paused_24Jul`).

## 2. Refresh the `automation_header` baseline in the `control` tab  ✅ DONE
`control.automation_header` now lists all 28 columns incl `years_in_business`.

## 3. (Already staged) point the ops alert at the full template
`WATI_TPL_LEAD_ALERT=wa_lead_alert_full` — see `BTB_PROD_FLIP.env-snippet`. Requires
`SHEET_FORM_TAB` to include `Saturday_Workshop` so `years_in_business?` is read.

## Verify after applying
- `GET /api/health?secret=…` → google_sheet check passes (schema OK).
- A new `Saturday_Workshop` lead ingests with its years value stored, and the ops
  alert shows "Years in business: …".
- Landing page `?rid=<token>` autofills the "Years in Business" field.

## What the code change touches (already done, staged on the branch)
- `service.ts`: `A.years`, `Prefill.years`, `rowToPrefill`, `ingestLead` append,
  `registerLead` (optional-write + prefill merge), `FormLead.years` + ingest read,
  `alertOpsNewLead` full 7-param.
- `app/api/register/route.ts`: parse `years`.
- `components/ui/RegisterModal.tsx`: "Years in Business" Select (conditional qualifier).
