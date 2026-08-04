// Booking flow: option lists, validation, and the lead submission contract.
//
// BACKEND CONTRACT: the payload shape sent to NEXT_PUBLIC_LEAD_ENDPOINT is
// defined by LeadPayload below and documented in README.md. Keep the two in
// sync — the backend team codes against the README.

export const DESIGNATIONS = [
  "HR Manager",
  "Talent Acquisition (TA) Head",
  "CHRO",
  "Others",
] as const;

export const EMPLOYEE_COUNTS = [
  "Less than 20",
  "21–100",
  "101–1,000",
  "More than 1,000",
] as const;

export const LOCATIONS = ["Pune", "Pimpri-Chinchwad", "Outside Pune"] as const;

/** Exactly the keys the backend receives. No more, no less. */
export type LeadPayload = {
  source: "landing_direct";
  created_at: string;
  full_name: string;
  company_name: string;
  designation: string;
  employee_count: string;
  location: string;
  /** Always 10 digits, country code stripped. */
  phone: string;
  email: string;
};

/**
 * Reduces anything a visitor might type into a bare 10-digit Indian mobile
 * number, or null if it isn't one.
 *
 * Accepts: 9876543210 · +91 98765 43210 · 0091-9876543210 · 09876543210
 * Rejects: anything that doesn't end up as 10 digits starting 6-9.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");

  // Drop any leading zeros (0…, 00…) before looking for a country code.
  let local = digits.replace(/^0+/, "");

  // Strip the Indian country code when it leaves exactly a 10-digit number.
  if (local.length === 12 && local.startsWith("91")) {
    local = local.slice(2);
  }

  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

export type SubmitResult = { ok: true } | { ok: false };

/**
 * POSTs the lead to this app's own /api/register.
 *
 * SAME-ORIGIN, and that is load-bearing rather than incidental. The founder page
 * and this one are the same deployment on two subdomains, and /api/register
 * picks the campaign — which sheet the row lands in, which Event Pass is issued,
 * which templates are sent — from the HOST the request arrives on. Posting to an
 * absolute NEXT_PUBLIC_LEAD_ENDPOINT would pin every submission to whichever
 * host that variable named, which is precisely how founder-page visitors ended
 * up registered in the HR sheet. A relative URL cannot get that wrong.
 *
 * The shape below is the register route's contract, not this file's LeadPayload:
 * the modal keeps its own snake_case vocabulary and the mapping happens here, so
 * the page's internals and the API stay independently changeable.
 *
 * Any non-2xx, or a network failure, resolves to { ok: false } so the caller can
 * show the inline error and keep the visitor's form state intact.
 */
export async function submitLead(payload: LeadPayload): Promise<SubmitResult> {
  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.full_name,
        company: payload.company_name,
        designation: payload.designation,
        employeeCount: payload.employee_count,
        location: payload.location,
        phone: payload.phone,
        email: payload.email,
        // Not asked on this page. Sent blank rather than omitted so the intent is
        // explicit: registerLead preserves whatever the Meta form already stored
        // for a known lead and only overwrites a field the visitor actually typed.
        years: "",
        expectations: "",
      }),
    });
    if (!response.ok) return { ok: false };
    // A 200 can still carry ok:false (the route answers 500 in that case, but be
    // defensive — a confirmation screen shown for a lead that was not written is
    // the one failure this page must never produce).
    const body = await response.json().catch(() => null);
    return body && body.ok === false ? { ok: false } : { ok: true };
  } catch {
    return { ok: false };
  }
}
