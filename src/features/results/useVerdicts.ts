import { useMemo } from "react";
import { evaluate, type HardwareSpec, type ModelSpec, type Settings, type Verdict } from "../../lib/compat";

export interface ScoredModel {
  model: ModelSpec;
  verdict: Verdict;
}

/** Pure, so tests can call it without rendering. */
export function scoreModels(
  models: ModelSpec[],
  hw: HardwareSpec,
  settings: Settings,
): ScoredModel[] {
  return models.map((model) => ({ model, verdict: evaluate(model, hw, settings) }));
}

/**
 * Re-scores on every input change. A few hundred models of arithmetic is well
 * under a frame, so there is no submit button — but memoising keeps React from
 * redoing it for unrelated re-renders.
 */
export function useVerdicts(
  models: ModelSpec[],
  hw: HardwareSpec,
  settings: Settings,
): ScoredModel[] {
  return useMemo(() => scoreModels(models, hw, settings), [models, hw, settings]);
}

/**
 * Above this share of VRAM a model still "runs", but with so little headroom
 * that a desktop compositor or a second application will push it into an OOM.
 * Presentation only: the engine's three buckets are unchanged, and this reads
 * the total evaluate() already computed rather than re-deriving anything.
 */
export const TIGHT_FIT_FRACTION = 0.9;

export function isTightFit(verdict: Verdict, vramBytes: number): boolean {
  if (verdict.status !== "run-on-gpu" || vramBytes <= 0 || verdict.breakdown === null) return false;
  return verdict.breakdown.totalBytes > vramBytes * TIGHT_FIT_FRACTION;
}
