import type { Category, VerdictStatus } from "../../lib/compat";
import type { ScoredModel } from "./useVerdicts";

export type SortKey = "compatibility" | "size" | "name" | "params";

/** Runnable first; within a bucket, smallest memory need first. */
const STATUS_RANK: Record<VerdictStatus, number> = {
  "run-on-gpu": 0,
  "cpu-offloaded": 1,
  "wont-run": 2,
};

export function applyFilters(
  rows: ScoredModel[],
  { query, categories }: { query: string; categories: Category[] },
): ScoredModel[] {
  const q = query.trim().toLowerCase();
  return rows.filter(({ model }) => {
    const matchesQuery =
      q === "" ||
      model.displayName.toLowerCase().includes(q) ||
      model.family.toLowerCase().includes(q);
    const matchesCategory =
      categories.length === 0 || categories.some((c) => model.categories.includes(c));
    return matchesQuery && matchesCategory;
  });
}

export function sortRows(rows: ScoredModel[], key: SortKey): ScoredModel[] {
  const copy = [...rows];
  switch (key) {
    case "size":
      return copy.sort((a, b) => a.verdict.breakdown.totalBytes - b.verdict.breakdown.totalBytes);
    case "name":
      return copy.sort((a, b) => a.model.displayName.localeCompare(b.model.displayName));
    case "params":
      return copy.sort((a, b) => b.model.params.total - a.model.params.total);
    case "compatibility":
    default:
      return copy.sort(
        (a, b) =>
          STATUS_RANK[a.verdict.status] - STATUS_RANK[b.verdict.status] ||
          a.verdict.breakdown.totalBytes - b.verdict.breakdown.totalBytes,
      );
  }
}
