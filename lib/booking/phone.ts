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

/**
 * Loose validity check, used to decide whether a landing-page lookup is worth
 * running. Stays permissive on purpose: someone typing their own number oddly
 * should still find their registration.
 */
export function isValidPhone(raw: string): boolean {
  const d = phoneDigits(raw);
  return d.length >= 10 && d.length <= 15;
}

/**
 * Can this number actually receive a WhatsApp message? Strict, because the cost
 * of being wrong is asymmetric: a number we can't deliver to burns a send on
 * every tick forever, and the failures are invisible unless someone reads Slack.
 *
 * Returns a short reason to record in wa_dead, or null if the number looks fine.
 *
 * Two live examples this catches, both created by a form typo:
 *   +91934049347016 -> 12-digit subscriber number
 *   +9170574671102  -> 11-digit subscriber number
 * The old 10-to-15-digit check passed both, because the stray digits kept the
 * total inside the range.
 */
export function phoneProblem(raw: string): string | null {
  const d = phoneDigits(raw);
  if (!d) return "no number";
  if (d.length < 10) return `too short (${d.length} digits)`;
  if (d.length > 15) return `too long (${d.length} digits)`; // E.164 maximum

  // Indian numbers are the overwhelming majority and the only ones we can check
  // properly: exactly 10 subscriber digits, and mobiles start 6-9. Landlines and
  // mistyped numbers fail here.
  let subscriber: string | null = null;
  if (d.length === 10) subscriber = d;
  else if (d.length === 11 && d.startsWith("0")) subscriber = d.slice(1);
  else if (d.startsWith(DEFAULT_CC)) subscriber = d.slice(DEFAULT_CC.length);

  if (subscriber !== null) {
    if (subscriber.length !== 10) {
      return `${subscriber.length} digits after +${DEFAULT_CC}, expected 10`;
    }
    if (!/^[6-9]/.test(subscriber)) {
      return `not a mobile (starts with ${subscriber[0]})`;
    }
    return null;
  }

  // Some other country code. We can't validate its numbering plan, so accept
  // anything of plausible E.164 length rather than block a real attendee.
  return null;
}

/** Convenience wrapper for call sites that only need a yes/no. */
export const canReceiveWhatsApp = (raw: string): boolean => phoneProblem(raw) === null;
