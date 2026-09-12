import type { ScoredModel } from "./useVerdicts";

/**
 * Two empty states for one dead end, shared by ModelList and ModelTable so
 * switching views never drops the message the user was looking at:
 *  - the filters/search narrowed the catalogue down to nothing
 *  - the whole catalogue was scored and nothing fits this machine
 * Pure, so both the message text and the "which case is this" logic live in
 * exactly one place.
 */
export function emptyResultsMessage(rows: ScoredModel[], filtered: boolean): string | null {
  if (rows.length === 0) {
    return "No models match these filters.";
  }

  // A list where every row says "Won't run" reads as a broken page. Say it
  // once, plainly, and point somewhere useful — but only when rows is the
  // full catalogue. If the user filtered down to this set on purpose, the
  // machine may well run plenty of other models; each card/row already
  // carries its own accurate "Won't run" pill and reason, which is more
  // useful than a summary that overstates.
  if (!filtered && rows.every((r) => r.verdict.status === "wont-run")) {
    return "Nothing here fits this machine. Try a smaller quantisation, a shorter context, or " +
      "an engine that can offload to system RAM — Ollama and llama.cpp both can.";
  }

  return null;
}

export function ResultsEmptyState({
  rows,
  filtered,
}: {
  rows: ScoredModel[];
  filtered: boolean;
}) {
  const message = emptyResultsMessage(rows, filtered);
  if (!message) return null;
  return <p className="empty">{message}</p>;
}
