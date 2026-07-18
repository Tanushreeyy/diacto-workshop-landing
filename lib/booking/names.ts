// Deciding whether two rows describe the same human.
//
// Only ever used to CONFIRM a duplicate that some stronger signal already
// suggested (an identical email address). It is deliberately biased towards
// saying "no": a false negative leaves a duplicate in place, which is merely the
// status quo, while a false positive retires a real attendee's row and silences
// their event-day reminders. When the two are in tension, say no.

const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "dr", "prof", "shri", "smt", "sri", "er", "ca",
]);

// "Dr. Deepa  Patil" -> ["deepa", "patil"];  "Prachi_Powar" -> ["prachi", "powar"]
export function nameTokens(raw: string): string[] {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z\s]/g, " ") // punctuation, digits, underscores -> spaces
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !HONORIFICS.has(t));
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

// Do two single tokens plausibly denote the same name part?
export function tokensCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  // An initial standing in for the full token: "k" for "kadam".
  if (a.length === 1 || b.length === 1) {
    const [short, long] = a.length === 1 ? [a, b] : [b, a];
    return long.startsWith(short);
  }
  // Typo tolerance, scaled to length so short names stay strict: one edit up to
  // 7 characters, two beyond. "shah" vs "patel" stays a mismatch.
  const tol = Math.min(2, Math.floor(Math.max(a.length, b.length) / 4));
  return editDistance(a, b) <= tol;
}

// Same person? Both names must be present — an empty name proves nothing, and
// guessing from a blank is exactly the false positive this guards against.
export function samePerson(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;

  // The leading token is the anchor. Two colleagues sharing info@company.com are
  // a different first name apart, and that alone must be enough to keep them
  // separate.
  if (!tokensCompatible(ta[0], tb[0])) return false;

  // Compare only as far as the shorter name goes, so "Shubham" still matches
  // "Shubham Kamble" — people routinely give just a first name one time and a
  // full name the next.
  const n = Math.min(ta.length, tb.length);
  for (let i = 1; i < n; i++) {
    if (!tokensCompatible(ta[i], tb[i])) return false;
  }
  return true;
}
