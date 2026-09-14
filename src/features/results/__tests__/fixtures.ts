import { GB, evaluate, type HardwareSpec, type Settings } from "../../../lib/compat";
import { loadModels } from "../../../lib/data/load";
import type { ScoredModel } from "../useVerdicts";

/** The reference machine the plan's golden anchors were computed against. */
export const REFERENCE_HW: HardwareSpec = {
  kind: "discrete-gpu",
  vramBytes: 12 * GB,
  ramBytes: 64 * GB,
};

export const REFERENCE_SETTINGS: Settings = {
  engine: "ollama",
  contextLength: 8192,
  kvPrecision: "fp16",
  quantId: "auto",
};

/** Small enough that nothing in the catalogue fits, for empty-state cases. */
export const TINY_HW: HardwareSpec = {
  kind: "discrete-gpu",
  vramBytes: 2 * GB,
  ramBytes: 4 * GB,
};

export const APPLE_HW: HardwareSpec = {
  kind: "apple-silicon",
  vramBytes: 24 * GB,
  ramBytes: 24 * GB,
  ramType: "unified",
};

/**
 * A genuinely null-breakdown row, produced the way evaluate() produces one in
 * the app: vLLM has no Metal backend, so the engine guard rejects this model
 * on Apple Silicon before any memory arithmetic runs at all. Built from a real
 * evaluate() call rather than a hand-written Verdict literal, so it cannot
 * drift from what the engine actually returns.
 */
export const unevaluableRow: ScoredModel = {
  model: loadModels()[0]!,
  verdict: evaluate(loadModels()[0]!, APPLE_HW, { ...REFERENCE_SETTINGS, engine: "vllm" }),
};
