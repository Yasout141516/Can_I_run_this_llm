export type EngineId = "ollama" | "llamacpp" | "koboldcpp" | "vllm" | "tgi" | "sglang";
export type QuantFormat = "gguf" | "awq" | "gptq" | "fp8" | "safetensors";
export type KvPrecision = "fp16" | "q8" | "q4";
export type RamType = "DDR4" | "DDR5" | "LPDDR4X" | "LPDDR5" | "LPDDR5X" | "unified";
export type Category =
  | "chat" | "code" | "reasoning" | "vision"
  | "embedding" | "medical" | "finance" | "legal";
export type BenchmarkId =
  | "mmlu" | "mmlu_pro" | "gpqa" | "humaneval" | "math" | "ifeval" | "swe_bench";

export interface ModelArch {
  numLayers: number;
  numKvHeads: number;
  headDim: number;
  maxContext: number;
}

export interface QuantOption {
  id: string;
  format: QuantFormat;
  sizeBytes: number;
  sizeSource: "measured" | "estimated";
  fileName?: string;
}

export interface ModelSpec {
  id: string;
  family: string;
  displayName: string;
  params: { total: number; active: number | null };
  arch: ModelArch;
  quants: QuantOption[];
  benchmarks: Partial<Record<BenchmarkId, number | null>>;
  categories: Category[];
  source: { hfRepo: string; archRepo?: string; ggufRepo?: string; fetchedAt: string };
}

export type HardwareKind = "discrete-gpu" | "apple-silicon" | "cpu-only";

export interface HardwareSpec {
  kind: HardwareKind;
  /** For apple-silicon this is ignored; the unified pool is `ramBytes`. */
  vramBytes: number;
  ramBytes: number;
  ramType?: RamType;
  memBandwidthGBs?: number;
}

export interface Settings {
  engine: EngineId;
  contextLength: number;
  kvPrecision: KvPrecision;
  quantId: string | "auto";
}

export type VerdictStatus = "run-on-gpu" | "cpu-offloaded" | "wont-run";
export type LimitingFactor = "vram" | "ram" | "context" | "format" | "engine";

export interface Breakdown {
  weightsBytes: number;
  kvCacheBytes: number;
  overheadBytes: number;
  totalBytes: number;
}

export interface Verdict {
  status: VerdictStatus;
  /** Null when a guard rejected the model before any memory arithmetic ran. */
  breakdown: Breakdown | null;
  confidence: "measured" | "estimated";
  quantId: string | null;
  gpuLayers?: number;
  limitingFactor?: LimitingFactor;
  notes: string[];
}
