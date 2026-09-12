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
  source: { hfRepo: string; ggufRepo?: string; fetchedAt: string };
}

export interface HardwareSpec {
  kind: "discrete-gpu" | "apple-silicon" | "cpu-only";
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
export type LimitingFactor = "vram" | "ram" | "context" | "format";

export interface Verdict {
  status: VerdictStatus;
  breakdown: {
    weightsBytes: number;
    kvCacheBytes: number;
    overheadBytes: number;
    totalBytes: number;
  };
  confidence: "measured" | "estimated";
  quantId: string | null;
  gpuLayers?: number;
  limitingFactor?: LimitingFactor;
  notes: string[];
}
