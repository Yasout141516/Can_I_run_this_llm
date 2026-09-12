import type { ModelSpec, QuantOption } from "./types";

/**
 * GGUF k-quants mix precision per block, so these are commonly-cited
 * approximations, not exact values. A measured file size always wins.
 */
export const GGUF_BPW: Readonly<Record<string, number>> = {
  FP16: 16,
  BF16: 16,
  Q8_0: 8.5,
  Q6_K: 6.6,
  Q5_K_M: 5.7,
  Q4_K_M: 4.8,
  Q4_0: 4.5,
  Q3_K_M: 3.9,
  Q2_K: 2.6,
};

/** Not k-quants. Sharing one table with GGUF would silently misprice these. */
export const NON_GGUF_BPW: Readonly<Record<string, number>> = {
  "AWQ-4bit": 4.25,
  "GPTQ-4bit": 4.25,
  "GPTQ-8bit": 8.25,
  FP8: 8,
  INT8: 8,
};

export function bitsPerWeight(quantId: string): number {
  const bpw = GGUF_BPW[quantId] ?? NON_GGUF_BPW[quantId];
  if (bpw === undefined) throw new Error(`Unknown quantisation: ${quantId}`);
  return bpw;
}

export function weightBytes(model: ModelSpec, quant: QuantOption): number {
  if (quant.sizeSource === "measured") return quant.sizeBytes;
  return (model.params.total * bitsPerWeight(quant.id)) / 8;
}
