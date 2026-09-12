import { useMemo, useState } from "react";
import { HardwarePanel } from "../features/hardware/HardwarePanel";
import { Filters } from "../features/results/Filters";
import { ModelList } from "../features/results/ModelList";
import { ModelTable } from "../features/results/ModelTable";
import { StatTiles } from "../features/results/StatTiles";
import { applyFilters, sortRows, type SortKey } from "../features/results/sort";
import { useVerdicts } from "../features/results/useVerdicts";
import { useHardwareContext } from "../hooks/useHardwareForm";
import { usableVram, type Category } from "../lib/compat";
import { loadModels } from "../lib/data/load";

export function CalculatorPage() {
  const form = useHardwareContext();
  const models = loadModels();
  const rows = useVerdicts(models, form.hw, form.settings);

  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("compatibility");
  const [view, setView] = useState<"cards" | "table">("cards");

  const shown = useMemo(
    () => sortRows(applyFilters(rows, { query, categories }), sortKey),
    [rows, query, categories, sortKey],
  );

  const vram = usableVram(form.hw);

  return (
    <main className="wrap">
      <header className="mast">
        <div>
          <div className="label eyebrow">Will it run?</div>
          <h1>Runcheck</h1>
          <p>
            Tell it what you have. It tells you what you can run, and the arithmetic behind
            every answer.
          </p>
        </div>
      </header>

      <div className="layout">
        <HardwarePanel form={form} />

        <section className="results" aria-label="Results">
          <StatTiles rows={rows} />
          <Filters
            query={query}
            categories={categories}
            sortKey={sortKey}
            view={view}
            onQuery={setQuery}
            onToggleCategory={(c) =>
              setCategories((prev) =>
                prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
              )
            }
            onSort={setSortKey}
            onView={setView}
          />
          {view === "cards" ? (
            <ModelList rows={shown} vramBytes={vram} />
          ) : (
            <ModelTable rows={shown} vramBytes={vram} />
          )}
        </section>
      </div>
    </main>
  );
}
