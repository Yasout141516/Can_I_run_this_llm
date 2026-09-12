import { describe, expect, it } from "vitest";
import { kvCacheBytes } from "../kvCache";
import type { ModelArch } from "../types";

const llama8b: ModelArch = { numLayers: 32, numKvHeads: 8, headDim: 128, maxContext: 131_072 };

describe("kvCacheBytes", () => {
  it("computes Llama 3.1 8B at 8K context, fp16, exactly", () => {
    expect(kvCacheBytes(llama8b, 8192, "fp16")).toBe(1_073_741_824);
  });

  it("halves at q8 and quarters at q4", () => {
    const fp16 = kvCacheBytes(llama8b, 8192, "fp16");
    expect(kvCacheBytes(llama8b, 8192, "q8")).toBe(fp16 / 2);
    expect(kvCacheBytes(llama8b, 8192, "q4")).toBe(fp16 / 4);
  });

  it("scales linearly with context length", () => {
    const at8k = kvCacheBytes(llama8b, 8192, "fp16");
    expect(kvCacheBytes(llama8b, 16_384, "fp16")).toBe(at8k * 2);
  });

  it("costs 4x more without GQA — 32 KV heads instead of 8", () => {
    const mha: ModelArch = { ...llama8b, numKvHeads: 32 };
    expect(kvCacheBytes(mha, 8192, "fp16")).toBe(kvCacheBytes(llama8b, 8192, "fp16") * 4);
  });

  it("is zero at zero context", () => {
    expect(kvCacheBytes(llama8b, 0, "fp16")).toBe(0);
  });
});
