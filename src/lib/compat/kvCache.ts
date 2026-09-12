import type { KvPrecision, ModelArch } from "./types";

export const KV_BYTES_PER_ELEMENT: Readonly<Record<KvPrecision, number>> = {
  fp16: 2,
  q8: 1,
  q4: 0.5,
};

/**
 * The leading 2 is the K and V tensors. `numKvHeads` — not attention heads —
 * is what matters: a GQA model with 8 KV heads against 64 query heads pays
 * one eighth the cache of an equivalent MHA model.
 */
export function kvCacheBytes(
  arch: ModelArch,
  contextLength: number,
  precision: KvPrecision,
): number {
  return (
    2 *
    arch.numLayers *
    arch.numKvHeads *
    arch.headDim *
    contextLength *
    KV_BYTES_PER_ELEMENT[precision]
  );
}
