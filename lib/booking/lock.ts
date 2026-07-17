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
let chain: Promise<unknown> = Promise.resolve();

export function withSheetLock<T>(label: string, fn: () => Promise<T>): Promise<T> {
  // Chain off the previous holder's SETTLEMENT, not its success — one caller
  // throwing must not wedge the queue for everyone behind it.
  const run = chain.then(
    () => fn(),
    () => fn(),
  );
  chain = run.then(
    () => undefined,
    (e) => {
      console.error(`[lock] ${label} failed:`, e);
      return undefined;
    },
  );
  return run;
}
