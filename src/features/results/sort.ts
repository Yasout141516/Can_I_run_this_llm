import type { Category, ModelSpec, VerdictStatus } from "../../lib/compat";
import type { ScoredModel } from "./useVerdicts";

export type SortKey = "compatibility" | "size" | "name" | "params";

/** Browse has no verdicts, so it sorts only on facts the data already holds. */
export type ModelSortKey = "name" | "params" | "context" | "size";

export interface FilterCriteria {
  query: string;
  categories: Category[];
}

/** Runnable first; within a bucket, smallest memory need first. */
const STATUS_RANK: Record<VerdictStatus, number> = {
  "run-on-gpu": 0,
  "cpu-offloaded": 1,
  "wont-run": 2,
};

/**
 * The single definition of "this model matches the controls". The calculator
 * filters scored rows and Browse filters bare models; both come through here,
 * so a change to what the search box searches cannot reach one page only.
 */
export function matchesModel(model: ModelSpec, { query, categories }: FilterCriteria): boolean {
  const q = query.trim().toLowerCase();
  const matchesQuery =
    q === "" ||
    model.displayName.toLowerCase().includes(q) ||
    model.family.toLowerCase().includes(q);
  const matchesCategory =
    categories.length === 0 || categories.some((c) => model.categories.includes(c));
  return matchesQuery && matchesCategory;
}

export function applyFilters(rows: ScoredModel[], criteria: FilterCriteria): ScoredModel[] {
  return rows.filter(({ model }) => matchesModel(model, criteria));
}

/** The smallest quant a model ships — the floor on what it could ever need. */
export function smallestQuantBytes(model: ModelSpec): number {
  return Math.min(...model.quants.map((q) => q.sizeBytes));
}

export function sortModels(models: ModelSpec[], key: ModelSortKey): ModelSpec[] {
  const copy = [...models];
  switch (key) {
    case "params":
      return copy.sort((a, b) => b.params.total - a.params.total);
    case "context":
      return copy.sort((a, b) => b.arch.maxContext - a.arch.maxContext);
    case "size":
      return copy.sort((a, b) => smallestQuantBytes(a) - smallestQuantBytes(b));
    case "name":
    default:
      return copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
}

/** A model the engine could not evaluate has no size to sort by, so it sorts last. */
const totalOf = (r: ScoredModel) => r.verdict.breakdown?.totalBytes ?? Infinity;

export function sortRows(rows: ScoredModel[], key: SortKey): ScoredModel[] {
  const copy = [...rows];
  switch (key) {
    case "size":
      return copy.sort((a, b) => totalOf(a) - totalOf(b));
    case "name":
      return copy.sort((a, b) => a.model.displayName.localeCompare(b.model.displayName));
    case "params":
      return copy.sort((a, b) => b.model.params.total - a.model.params.total);
    case "compatibility":
    default:
      return copy.sort(
        (a, b) => STATUS_RANK[a.verdict.status] - STATUS_RANK[b.verdict.status] || totalOf(a) - totalOf(b),
      );
  }
}
