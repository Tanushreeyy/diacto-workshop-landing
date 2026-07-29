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

let overrides: Partial<Record<TabOverrideKey, string>> = {};

/** The control-tab override for `key`, or "" when none is set. Synchronous:
 *  returns whatever loadTabOverrides() last parked here. */
export function tabOverride(key: TabOverrideKey): string {
  return overrides[key] || "";
}

/** Replace the parked overrides. Called only by loadTabOverrides() in control.ts. */
export function setTabOverrides(next: Partial<Record<TabOverrideKey, string>>): void {
  overrides = next;
}
