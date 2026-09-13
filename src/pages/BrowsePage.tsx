import { useMemo, useState } from "react";
import { CatalogTable } from "../features/browse/CatalogTable";
import { BROWSE_SORT_OPTIONS, Filters } from "../features/results/Filters";
import { matchesModel, sortModels, type ModelSortKey } from "../features/results/sort";
import type { Category } from "../lib/compat";
import { loadModels } from "../lib/data/load";

/**
 * The catalogue. It deliberately takes no hardware and renders no verdict:
 * this page answers "what exists and what is it", and the calculator answers
 * "will it run for me". Search and categories come through the same
 * matchesModel() predicate the calculator uses, so the two cannot disagree.
 */
export function BrowsePage() {
  const models = loadModels();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [sortKey, setSortKey] = useState<ModelSortKey>("name");

  const shown = useMemo(
    () => sortModels(models.filter((m) => matchesModel(m, { query, categories })), sortKey),
    [models, query, categories, sortKey],
  );

  return (
    <main className="wrap">
      <header className="mast">
        <div>
          <div className="label eyebrow">Browse LLMs</div>
          <h1>Every model we track</h1>
          <p>
            What each model is, before any question of hardware: size, shape, context window and
            the smallest build on offer.
          </p>
        </div>
      </header>

      <section className="results" aria-label="Model catalogue">
        <Filters
          query={query}
          categories={categories}
          sortKey={sortKey}
          sortOptions={BROWSE_SORT_OPTIONS}
          onQuery={setQuery}
          onToggleCategory={(c) =>
            setCategories((prev) =>
              prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
            )
          }
          onSort={setSortKey}
        />
        <CatalogTable models={shown} />
      </section>
    </main>
  );
}
