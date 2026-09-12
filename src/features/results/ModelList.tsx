import { ModelCard } from "./ModelCard";
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
  if (rows.length === 0) {
    return <p className="empty">No models match these filters.</p>;
  }

  // A list where every row says "Won't run" reads as a broken page. Say it
  // once, plainly, and point somewhere useful — but only when rows is the
  // full catalogue. If the user filtered down to this set on purpose, the
  // machine may well run plenty of other models; each card already carries
  // its own accurate "Won't run" pill and reason, which is more useful than a
  // summary that overstates.
  if (!filtered && rows.every((r) => r.verdict.status === "wont-run")) {
    return (
      <p className="empty">
        Nothing here fits this machine. Try a smaller quantisation, a shorter context, or
        an engine that can offload to system RAM — Ollama and llama.cpp both can.
      </p>
    );
  }

  return (
    <div className="verdicts">
      {rows.map((row) => (
        <ModelCard key={row.model.id} row={row} vramBytes={vramBytes} />
      ))}
    </div>
  );
}
