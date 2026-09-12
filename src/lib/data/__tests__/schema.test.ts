import { describe, expect, it } from "vitest";
import { modelsFileSchema, SCHEMA_VERSION } from "../schema";

const validModel = {
  id: "meta-llama/Llama-3.1-8B-Instruct",
  family: "Llama 3.1",
  displayName: "Llama 3.1 8B Instruct",
  params: { total: 8_030_000_000, active: null },
  arch: { numLayers: 32, numKvHeads: 8, headDim: 128, maxContext: 131_072 },
  quants: [
    {
      id: "Q4_K_M",
      format: "gguf",
      sizeBytes: 4_920_734_208,
      sizeSource: "measured",
      fileName: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    },
  ],
  benchmarks: { mmlu: 69.4 },
  categories: ["chat"],
  source: { hfRepo: "meta-llama/Llama-3.1-8B-Instruct", fetchedAt: "2026-09-12T00:00:00Z" },
};

const file = (models: unknown[]) => ({ schemaVersion: SCHEMA_VERSION, models });

describe("modelsFileSchema", () => {
  it("accepts a well-formed model", () => {
    expect(modelsFileSchema.safeParse(file([validModel])).success).toBe(true);
  });

  it("rejects a model missing numKvHeads", () => {
    const { numKvHeads, ...arch } = validModel.arch;
    const result = modelsFileSchema.safeParse(file([{ ...validModel, arch }]));
    expect(result.success).toBe(false);
  });

  it("rejects a wrong schemaVersion so stale data cannot be misread", () => {
    const result = modelsFileSchema.safeParse({ schemaVersion: 99, models: [validModel] });
    expect(result.success).toBe(false);
  });

  it("rejects a measured quant with no fileName", () => {
    const quants = [{ ...validModel.quants[0], fileName: undefined }];
    expect(modelsFileSchema.safeParse(file([{ ...validModel, quants }])).success).toBe(false);
  });

  it("rejects a negative parameter count", () => {
    const params = { total: -1, active: null };
    expect(modelsFileSchema.safeParse(file([{ ...validModel, params }])).success).toBe(false);
  });
});
