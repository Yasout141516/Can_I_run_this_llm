import type { ModelSpec } from "../../src/lib/compat/types";

const withoutTimestamp = (m: ModelSpec) =>
  JSON.stringify({ ...m, source: { ...m.source, fetchedAt: "" } });

/**
 * A model keeps the timestamp it already had unless something else about it
 * changed. Without this the scheduled job rewrites data/models.json every
 * run, and the commit log — which exists to make every data change a
 * reviewable diff (spec §6) — fills with timestamp bumps instead.
 */
export function mergePreservingTimestamps(next: ModelSpec[], previous: ModelSpec[]): ModelSpec[] {
  const before = new Map(previous.map((m) => [m.id, m]));
  return next.map((m) => {
    const old = before.get(m.id);
    if (!old || withoutTimestamp(old) !== withoutTimestamp(m)) return m;
    return { ...m, source: { ...m.source, fetchedAt: old.source.fetchedAt } };
  });
}
