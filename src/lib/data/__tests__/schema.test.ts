import { describe, expect, it } from "vitest";
import { modelsFileSchema, SCHEMA_VERSION } from "../schema";
import familiesJson from "../../../../config/families.json";
import { familiesFileSchema } from "../schema";

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

  it("rejects an estimated quant id the bits-per-weight table cannot price", () => {
    const quants = [{ id: "IQ3_XXS", format: "gguf", sizeBytes: 0, sizeSource: "estimated" }];
    expect(modelsFileSchema.safeParse(file([{ ...validModel, quants }])).success).toBe(false);
  });

  it("accepts an estimated quant id the bits-per-weight table knows", () => {
    const quants = [{ id: "Q4_K_M", format: "gguf", sizeBytes: 0, sizeSource: "estimated" }];
    expect(modelsFileSchema.safeParse(file([{ ...validModel, quants }])).success).toBe(true);
  });

  it("still accepts a measured quant with an id the table cannot price", () => {
    // Measured quants carry a real file size and never consult the table —
    // the exemption is deliberate.
    const quants = [
      {
        id: "IQ3_XXS",
        format: "gguf",
        sizeBytes: 3_000_000_000,
        sizeSource: "measured",
        fileName: "x-IQ3_XXS.gguf",
      },
    ];
    expect(modelsFileSchema.safeParse(file([{ ...validModel, quants }])).success).toBe(true);
  });

  it("rejects a measured quant with sizeBytes: 0", () => {
    const quants = [{ ...validModel.quants[0], sizeBytes: 0 }];
    expect(modelsFileSchema.safeParse(file([{ ...validModel, quants }])).success).toBe(false);
  });

  it("still accepts an estimated quant with sizeBytes: 0 — the established sentinel", () => {
    const quants = [{ id: "Q4_K_M", format: "gguf", sizeBytes: 0, sizeSource: "estimated" }];
    expect(modelsFileSchema.safeParse(file([{ ...validModel, quants }])).success).toBe(true);
  });

  it("rejects an unknown benchmark key", () => {
    const benchmarks = { mmluPro: 70 };
    expect(modelsFileSchema.safeParse(file([{ ...validModel, benchmarks }])).success).toBe(false);
  });

  it("accepts known benchmark keys with null values", () => {
    const benchmarks = { mmlu: null, gpqa: null, swe_bench: 42.1 };
    expect(modelsFileSchema.safeParse(file([{ ...validModel, benchmarks }])).success).toBe(true);
  });
});

describe("familiesFileSchema", () => {
  it("accepts the tracked families as written", () => {
    expect(() => familiesFileSchema.parse(familiesJson)).not.toThrow();
  });

  it("requires an archRepo for a gated org, because config.json 401s there", () => {
    const gated = {
      families: [
        { name: "Llama 3.1", hfOrg: "meta-llama", categories: ["chat"],
          repos: [{ name: "Llama-3.1-8B-Instruct" }] },
      ],
    };
    expect(() => familiesFileSchema.parse(gated)).toThrow(/archRepo/);
  });
});
