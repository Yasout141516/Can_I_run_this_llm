import { describe, expect, it } from "vitest";
import { GB } from "../memory";
import { bitsPerWeight, weightBytes } from "../quant";
import type { ModelSpec, QuantOption } from "../types";

const model7b = {
  params: { total: 7_000_000_000, active: null },
} as ModelSpec;

const estimated = (id: string, format: QuantOption["format"] = "gguf"): QuantOption => ({
  id,
  format,
  sizeBytes: 0,
  sizeSource: "estimated",
});

describe("bitsPerWeight", () => {
  it("returns the GGUF k-quant approximation", () => {
    expect(bitsPerWeight("Q4_K_M")).toBe(4.8);
  });

  it("returns the non-GGUF value from its own table", () => {
    expect(bitsPerWeight("AWQ-4bit")).toBe(4.25);
  });

  it("throws on an unknown quantisation rather than guessing", () => {
    expect(() => bitsPerWeight("Q9_WAT")).toThrow(/Unknown quantisation/);
  });
});

describe("weightBytes", () => {
  it("estimates a 7B at FP16 as ~14 GB", () => {
    expect(weightBytes(model7b, estimated("FP16")) / GB).toBeCloseTo(14, 2);
  });

  it("estimates a 7B at Q4_K_M as ~4.2 GB", () => {
    expect(weightBytes(model7b, estimated("Q4_K_M")) / GB).toBeCloseTo(4.2, 2);
  });

  it("prefers a measured file size over the formula", () => {
    const measured: QuantOption = {
      id: "Q4_K_M",
      format: "gguf",
      sizeBytes: 4_920_734_208,
      sizeSource: "measured",
      fileName: "x.gguf",
    };
    expect(weightBytes(model7b, measured)).toBe(4_920_734_208);
  });

  it("uses total params, not active, for a MoE model", () => {
    const moe = { params: { total: 235_000_000_000, active: 22_000_000_000 } } as ModelSpec;
    expect(weightBytes(moe, estimated("Q4_K_M")) / GB).toBeCloseTo(141, 0);
  });
});
