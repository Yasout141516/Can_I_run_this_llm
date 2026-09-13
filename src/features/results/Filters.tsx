import { Chip } from "../../components/ui/Chip";
import { Segmented } from "../../components/ui/Segmented";
import type { Category } from "../../lib/compat";
import type { ModelSortKey, SortKey } from "./sort";

const CATEGORIES: Category[] = ["chat", "code", "reasoning", "vision"];

const VIEW_OPTIONS = [
  { value: "cards" as const, label: "Cards" },
  { value: "table" as const, label: "Table" },
];

export interface SortOption<K extends string> {
  value: K;
  label: string;
}

/** Scored rows: two of these keys read the verdict. */
export const CALCULATOR_SORT_OPTIONS: SortOption<SortKey>[] = [
  { value: "compatibility", label: "Compatibility" },
  { value: "size", label: "Memory needed" },
  { value: "params", label: "Parameters" },
  { value: "name", label: "Name" },
];

/** Browse has no verdicts, so every key here is a fact about the model. */
export const BROWSE_SORT_OPTIONS: SortOption<ModelSortKey>[] = [
  { value: "name", label: "Name" },
  { value: "params", label: "Parameters" },
  { value: "context", label: "Max context" },
  { value: "size", label: "Smallest quant" },
];

/**
 * One control for both lists. The calculator passes a view toggle; Browse has
 * a single presentation and passes none. Sorting is generic over the key type
 * so a page cannot offer a sort its list is unable to perform.
 */
export function Filters<K extends string>({
  query,
  categories,
  sortKey,
  sortOptions,
  view,
  onQuery,
  onToggleCategory,
  onSort,
  onView,
}: {
  query: string;
  categories: Category[];
  sortKey: K;
  sortOptions: SortOption<K>[];
  view?: "cards" | "table";
  onQuery: (q: string) => void;
  onToggleCategory: (c: Category) => void;
  onSort: (k: K) => void;
  onView?: (v: "cards" | "table") => void;
}) {
  return (
    <div className="filters">
      <input
        className="input"
        type="search"
        aria-label="Filter models"
        placeholder="Filter models…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />

      <div className="chips">
        {CATEGORIES.map((c) => (
          <Chip key={c} pressed={categories.includes(c)} onClick={() => onToggleCategory(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <select
        className="select"
        aria-label="Sort by"
        value={sortKey}
        onChange={(e) => onSort(e.target.value as K)}
      >
        {sortOptions.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {view && onView ? (
        <Segmented label="View" options={VIEW_OPTIONS} value={view} onChange={onView} />
      ) : null}
    </div>
  );
}
