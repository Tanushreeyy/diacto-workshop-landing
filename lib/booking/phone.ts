// Phone normalisation. People type numbers a dozen different ways and Meta adds
// its own prefixes, so everything funnels through here.
//
//   "+91 98765 43210"   "098765-43210"   "919876543210"
//   "(+91) 9876543210"  "p:+919876543210"   "9876543210"
//        …all match the same person.

const DEFAULT_CC = "91"; // India

/** Strip everything that isn't a digit (also drops Meta's "p:" test prefix). */
export function phoneDigits(raw: string): string {
  return (raw || "").replace(/^p:/i, "").replace(/\D/g, "");
}

/**
 * The matching key: the last 10 digits. This is what makes lookup robust —
 * it's identical whether or not the country code, a leading 0, spaces, dashes,
 * brackets or a "+" were typed.
 */
export function phoneKey(raw: string): string {
  return phoneDigits(raw).slice(-10);
}

/** Canonical E.164 for storage/display: "+919876543210". */
export function toE164(raw: string, cc: string = DEFAULT_CC): string {
  let d = phoneDigits(raw);
  if (!d) return "";
  if (d.length === 10) {
    d = cc + d; // bare local mobile
  } else if (d.length === 11 && d.startsWith("0")) {
    d = cc + d.slice(1); // leading trunk zero
  }
  // Already carries a country code (or is a non-Indian number) — leave it be.
  return "+" + d;
}

/** Digits with country code, no "+" — the format WATI expects. */
export function toWatiNumber(raw: string): string {
  return phoneDigits(toE164(raw));
}

/** Loose validity check: a real mobile has at least 10 digits. */
export function isValidPhone(raw: string): boolean {
  const d = phoneDigits(raw);
  return d.length >= 10 && d.length <= 15;
}
