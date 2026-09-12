import { ModelCard } from "./ModelCard";
import type { ScoredModel } from "./useVerdicts";

export function ModelList({ rows, vramBytes }: { rows: ScoredModel[]; vramBytes: number }) {
  if (rows.length === 0) {
    return <p className="empty">No models match these filters.</p>;
  }

  // A list where every row says "Won't run" reads as a broken page. Say it once,
  // plainly, and point somewhere useful — but only once there is more than one
  // such row. A single row is what a search narrowed down to on purpose, and
  // that specific model's own card is more useful than a generic dismissal.
  if (rows.length > 1 && rows.every((r) => r.verdict.status === "wont-run")) {
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
