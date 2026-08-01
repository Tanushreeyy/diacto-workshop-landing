// In-memory holder for tab-name overrides sourced from the control tab.
//
// Why a holder, not a direct lookup: the tab getters in env.ts are synchronous
// and called from many code paths, but the override values come from the control
// tab — an async Sheets read. So they are loaded ONCE per entry point by
// loadTabOverrides() (control.ts) and parked here, where the getters read them
// synchronously. This module imports NOTHING on purpose: env.ts imports it, and
// a dependency-free holder can never form an import cycle.
//
// Empty until loaded → the env vars are the sole source, i.e. exactly the
// behaviour before overrides existed.

// The three tab names that MAY be overridden from the control tab. SHEET_CONTROL_TAB
// is deliberately NOT here: it is how the control tab itself is found, so it cannot
// live inside the tab it locates.
export const TAB_OVERRIDE_KEYS = ["automation_tab", "form_tab", "calling_tab"] as const;
export type TabOverrideKey = (typeof TAB_OVERRIDE_KEYS)[number];

// Parked PER SHEET, not globally.
//
// A single bag of overrides is correct only while a process ever serves one
// campaign. Point a second sheet at the same process and the second load
// overwrites the first — so campaign A would go on resolving tab names that came
// out of campaign B's control tab, silently, and the automation tab is WRITTEN.
// That is how one campaign's registrations end up appended to another's sheet.
//
// The sheet id is passed in rather than read, because this module deliberately
// imports nothing: env.ts imports it, and a dependency-free holder can never form
// an import cycle. env.ts already knows the sheet id, so it simply says which one
// it is asking about.
let overrides = new Map<string, Partial<Record<TabOverrideKey, string>>>();

/** The control-tab override for `key` on `sheetId`, or "" when none is set.
 *  Synchronous: returns whatever loadTabOverrides() last parked for that sheet. */
export function tabOverride(key: TabOverrideKey, sheetId = "default"): string {
  return overrides.get(sheetId)?.[key] || "";
}

/** Replace the parked overrides for one sheet. Only loadTabOverrides() calls this. */
export function setTabOverrides(
  next: Partial<Record<TabOverrideKey, string>>,
  sheetId = "default",
): void {
  overrides.set(sheetId, next);
}
