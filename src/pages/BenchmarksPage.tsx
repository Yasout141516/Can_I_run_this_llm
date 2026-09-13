import { useMemo, useState } from "react";
import { Filters, type SortOption } from "../features/results/Filters";
import { matchesModel } from "../features/results/sort";
import {
  BENCHMARKS,
  sortByBenchmark,
  type BenchmarkSortKey,
} from "../features/benchmarks/benchmarkMeta";
import { ScoreTable } from "../features/benchmarks/ScoreTable";
import type { Category } from "../lib/compat";
import { loadModels } from "../lib/data/load";

const SORT_OPTIONS: SortOption<BenchmarkSortKey>[] = [
  ...BENCHMARKS.map(({ id, label }) => ({ value: id as BenchmarkSortKey, label })),
  { value: "name", label: "Name" },
];

/**
 * Scores, with no reference to your hardware: a benchmark says how good a
 * model is, never whether you can run it. That question belongs to the
 * calculator, and the two must not be blurred into a single number.
 */
export function BenchmarksPage() {
  const models = loadModels();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [sortKey, setSortKey] = useState<BenchmarkSortKey>("mmlu");

  const shown = useMemo(
    () => sortByBenchmark(models.filter((m) => matchesModel(m, { query, categories })), sortKey),
    [models, query, categories, sortKey],
  );

  return (
    <main className="wrap">
      <header className="mast">
        <div>
          <div className="label eyebrow">Benchmarks</div>
          <h1>How well they score</h1>
          <p>
            Published evaluation results for every tracked model. A score says how capable a
            model is; whether it fits your machine is a separate question, and a separate page.
          </p>
        </div>
      </header>

      <section className="results" aria-label="Benchmark scores">
        <Filters
          query={query}
          categories={categories}
          sortKey={sortKey}
          sortOptions={SORT_OPTIONS}
          onQuery={setQuery}
          onToggleCategory={(c) =>
            setCategories((prev) =>
              prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
            )
          }
          onSort={setSortKey}
        />
        <ScoreTable models={shown} />
        <p className="why">
          <b>Where these come from</b>{" "}
          <span>
            Every number is copied by hand from the vendor's own model card — never scraped —
            so a row is measured under that vendor's harness and shot settings. Read down a
            column with care and across vendors more carefully still. An em dash means the
            score was never published, not that the model scored nothing.
          </span>
        </p>
      </section>

      <section className="panel glossary" aria-label="What these measure">
        <h2 className="label">What these measure</h2>
        <dl>
          {BENCHMARKS.map(({ id, label, blurb }) => (
            <div key={id}>
              <dt>{label}</dt>
              <dd>{blurb}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
