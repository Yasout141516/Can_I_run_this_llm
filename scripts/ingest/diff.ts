import type { ModelSpec } from "../../src/lib/compat/types";

const withoutTimestamp = (m: ModelSpec) =>
  JSON.stringify({ ...m, source: { ...m.source, fetchedAt: "" } });

/**
 * A model keeps the timestamp it already had unless something else about it
 * changed. Without this the scheduled job rewrites data/models.json every
 * run, and the commit log — which exists to make every data change a
 * reviewable diff (spec §6) — fills with timestamp bumps instead.
 *
 * A model present in `previous` but absent from `next` is dropped: this
 * function only carries timestamps forward for models the current run still
 * builds. This is how removing a line from config/families.json removes a
 * model from data/models.json — there is no separate deletion step.
 */
export function mergePreservingTimestamps(next: ModelSpec[], previous: ModelSpec[]): ModelSpec[] {
  const before = new Map(previous.map((m) => [m.id, m]));
  return next.map((m) => {
    const old = before.get(m.id);
    if (!old || withoutTimestamp(old) !== withoutTimestamp(m)) return m;
    return { ...m, source: { ...m.source, fetchedAt: old.source.fetchedAt } };
  });
}

/**
 * True when `existing` (read from disk) and `serialised` (freshly built)
 * hold the same content, modulo line-ending style. `JSON.stringify` always
 * emits bare `\n`, but a Windows checkout with `core.autocrlf=true` — a
 * common global git setting — rewrites LF to CRLF on checkout. A raw byte
 * comparison would then see every line as different and rewrite
 * data/models.json on every run even when nothing changed, reintroducing
 * exactly the timestamp-churn problem `mergePreservingTimestamps` exists to
 * prevent. Only `existing` needs normalising: `serialised` is always
 * produced by this codebase and is always bare `\n`.
 */
export function isUnchanged(existing: string, serialised: string): boolean {
  return existing.replace(/\r\n/g, "\n") === serialised;
}
