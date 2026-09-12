import { GB } from "../memory";
import type { HardwareSpec, ModelSpec } from "../types";

export const llama8b: ModelSpec = {
  id: "meta-llama/Llama-3.1-8B-Instruct",
  family: "Llama 3.1",
  displayName: "Llama 3.1 8B Instruct",
  params: { total: 8_030_000_000, active: null },
  arch: { numLayers: 32, numKvHeads: 8, headDim: 128, maxContext: 131_072 },
  quants: [
    { id: "Q4_K_M", format: "gguf", sizeBytes: 4_920_734_208, sizeSource: "measured", fileName: "Llama-3.1-8B-Instruct-Q4_K_M.gguf" },
    { id: "AWQ-4bit", format: "awq", sizeBytes: 0, sizeSource: "estimated" },
  ],
  benchmarks: { mmlu: 69.4 },
  categories: ["chat"],
  source: { hfRepo: "meta-llama/Llama-3.1-8B-Instruct", fetchedAt: "2026-09-12T00:00:00Z" },
};

export const llama70b: ModelSpec = {
  id: "meta-llama/Llama-3.3-70B-Instruct",
  family: "Llama 3.3",
  displayName: "Llama 3.3 70B Instruct",
  params: { total: 70_600_000_000, active: null },
  arch: { numLayers: 80, numKvHeads: 8, headDim: 128, maxContext: 131_072 },
  quants: [
    { id: "Q4_K_M", format: "gguf", sizeBytes: 42_500_000_000, sizeSource: "measured", fileName: "Llama-3.3-70B-Instruct-Q4_K_M.gguf" },
  ],
  benchmarks: { mmlu: 86.0 },
  categories: ["chat", "reasoning"],
  source: { hfRepo: "meta-llama/Llama-3.3-70B-Instruct", fetchedAt: "2026-09-12T00:00:00Z" },
};

export const qwen235bMoe: ModelSpec = {
  id: "Qwen/Qwen3-235B-A22B",
  family: "Qwen3",
  displayName: "Qwen3 235B A22B",
  params: { total: 235_000_000_000, active: 22_000_000_000 },
  arch: { numLayers: 94, numKvHeads: 4, headDim: 128, maxContext: 32_768 },
  quants: [{ id: "Q4_K_M", format: "gguf", sizeBytes: 0, sizeSource: "estimated" }],
  benchmarks: { mmlu: null },
  categories: ["reasoning"],
  source: { hfRepo: "Qwen/Qwen3-235B-A22B", fetchedAt: "2026-09-12T00:00:00Z" },
};

/** RTX 4070, 12 GB VRAM, 64 GB DDR5 — the reference machine. */
export const rtx4070: HardwareSpec = {
  kind: "discrete-gpu",
  vramBytes: 12 * GB,
  ramBytes: 64 * GB,
  ramType: "DDR5",
};
