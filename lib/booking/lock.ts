// Serialises read-modify-write against the automation tab.
//
// The Sheets API has no transactions and no conditional writes, so every writer
// here does read → find → append. Two of them racing both read a table that does
// not yet contain the other's row, and both append. That is not theoretical: a
// lead's form ingest and her landing-page registration landed 161ms apart and
// produced two rows for one person, one of which kept nurturing her after she
// had registered.
//
// A promise chain fixes it because prod is ONE Node process (docker-compose runs
// a single `app` service behind Caddy; the cron sidecar drives it over the
// network rather than in-process).
//
// LIMITS — read before relying on this:
//   * It holds only while there is exactly one app container. Scale `app` to two
//     replicas and both get their own chain and the race silently returns. If you
//     ever scale out, this must become a real lock (a lease row, Redis, a DB).
//   * It is a mutex, not a transaction. It orders OUR writes; it cannot stop a
//     human editing the sheet underneath us. The phone-keyed reconcile in the
//     tick is the backstop for rows that raced before this existed.
//   * It is ONE CHAIN PER SHEET, not one globally. A single chain would serialise
//     campaigns against each other: two workshops running from two spreadsheets
//     cannot corrupt each other's rows — they share no table — so making one wait
//     on the other buys nothing and costs throughput on a tick that already runs
//     to a time budget. Same-sheet writers still queue, which is the whole point.
const chains = new Map<string, Promise<unknown>>();

export function withSheetLock<T>(
  label: string,
  fn: () => Promise<T>,
  // Which sheet is being written. Defaults to a shared chain so existing callers
  // keep exactly their previous behaviour.
  scope = "default",
): Promise<T> {
  const prev = chains.get(scope) ?? Promise.resolve();
  // Chain off the previous holder's SETTLEMENT, not its success — one caller
  // throwing must not wedge the queue for everyone behind it.
  const run = prev.then(
    () => fn(),
    () => fn(),
  );
  chains.set(
    scope,
    run.then(
      () => undefined,
      (e) => {
        console.error(`[lock] ${label} failed:`, e);
        return undefined;
      },
    ),
  );
  return run;
}
