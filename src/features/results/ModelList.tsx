import { ModelCard } from "./ModelCard";
import { emptyResultsMessage } from "./ResultsEmptyState";
import type { ScoredModel } from "./useVerdicts";

export function ModelList({
  rows,
  vramBytes,
  filtered,
}: {
  rows: ScoredModel[];
  vramBytes: number;
  /** Whether `rows` is a search/category-narrowed subset of the catalogue,
   * rather than the whole thing. "Nothing here fits this machine" is only a
   * true statement about the machine when it hasn't been said. */
  filtered: boolean;
}) {
  const empty = emptyResultsMessage(rows, filtered);
  if (empty) return <p className="empty">{empty}</p>;

  return (
    <div className="verdicts">
      {rows.map((row) => (
        <ModelCard key={row.model.id} row={row} vramBytes={vramBytes} />
      ))}
    </div>
  );
}
