import { Chip } from "../../components/ui/Chip";
import { Segmented } from "../../components/ui/Segmented";
import type { Category } from "../../lib/compat";
import type { SortKey } from "./sort";

const CATEGORIES: Category[] = ["chat", "code", "reasoning", "vision"];

const VIEW_OPTIONS = [
  { value: "cards" as const, label: "Cards" },
  { value: "table" as const, label: "Table" },
];

export function Filters({
  query,
  categories,
  sortKey,
  view,
  onQuery,
  onToggleCategory,
  onSort,
  onView,
}: {
  query: string;
  categories: Category[];
  sortKey: SortKey;
  view: "cards" | "table";
  onQuery: (q: string) => void;
  onToggleCategory: (c: Category) => void;
  onSort: (k: SortKey) => void;
  onView: (v: "cards" | "table") => void;
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
        onChange={(e) => onSort(e.target.value as SortKey)}
      >
        <option value="compatibility">Compatibility</option>
        <option value="size">Memory needed</option>
        <option value="params">Parameters</option>
        <option value="name">Name</option>
      </select>

      <Segmented
        label="View"
        options={VIEW_OPTIONS}
        value={view}
        onChange={onView}
      />
    </div>
  );
}
