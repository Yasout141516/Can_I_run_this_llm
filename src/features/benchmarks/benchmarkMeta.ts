import type { BenchmarkId } from "../../lib/compat";

export interface BenchmarkMeta {
  id: BenchmarkId;
  /** Short header, as the benchmark is normally written. */
  label: string;
  /** What it actually tests — the part a score alone does not tell you. */
  blurb: string;
}

/**
 * Order is the column order, loosely knowledge → reasoning → code. Every id in
 * the schema appears, including ones no tracked model reports yet: a visible
 * empty column is an honest statement that nobody published the number, and a
 * hidden one would quietly redefine what the page covers as the data changes.
 */
export const BENCHMARKS: BenchmarkMeta[] = [
  {
    id: "mmlu",
    label: "MMLU",
    blurb:
      "57 school and professional subjects, multiple choice. Measures breadth of knowledge, and is old enough that most models have seen material like it.",
  },
  {
    id: "mmlu_pro",
    label: "MMLU-Pro",
    blurb:
      "MMLU's harder successor: ten options instead of four and reasoning-heavy questions, so a lucky guess is worth less.",
  },
  {
    id: "gpqa",
    label: "GPQA",
    blurb:
      "Graduate-level physics, chemistry and biology, written so the answers cannot be found by searching. Reasoning rather than recall.",
  },
  {
    id: "math",
    label: "MATH",
    blurb: "Competition mathematics, scored on the final answer rather than the working.",
  },
  {
    id: "ifeval",
    label: "IFEval",
    blurb:
      "Instruction-following that a program can check — “exactly three bullets”, “no commas”. Tests obedience to form, not knowledge.",
  },
  {
    id: "humaneval",
    label: "HumanEval",
    blurb:
      "164 small Python problems, scored on whether the generated function passes hidden unit tests on the first attempt.",
  },
  {
    id: "swe_bench",
    label: "SWE-bench",
    blurb:
      "Real issues from real GitHub repositories, scored on whether the model's patch makes the project's own test suite pass. Much harder than HumanEval.",
  },
];

export type BenchmarkSortKey = "name" | BenchmarkId;

/**
 * Ranked by a benchmark: strongest first, and every model that did not report
 * the number last regardless of direction. A missing score is not a low score,
 * so it must never sort as though it were one.
 */
export function sortByBenchmark<T extends { displayName: string; benchmarks: Partial<Record<BenchmarkId, number | null>> }>(
  models: T[],
  key: BenchmarkSortKey,
): T[] {
  const copy = [...models];
  if (key === "name") return copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
  const score = (m: T) => m.benchmarks[key] ?? null;
  return copy.sort((a, b) => {
    const x = score(a);
    const y = score(b);
    if (x === null && y === null) return a.displayName.localeCompare(b.displayName);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x;
  });
}
