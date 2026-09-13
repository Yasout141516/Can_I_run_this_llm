// @vitest-environment node
import { describe, expect, it } from "vitest";
import { modelSchema } from "../../../src/lib/data/schema";
import { assembleModel } from "../assemble";

const BASE = {
  familyName: "Llama 3.1",
  hfRepo: "meta-llama/Llama-3.1-8B-Instruct",
  archRepo: "unsloth/Meta-Llama-3.1-8B-Instruct",
  ggufRepo: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
  categories: ["chat"] as const,
  totalParams: 8_030_261_248,
  config: {
    num_hidden_layers: 32, num_key_value_heads: 8, head_dim: 128,
    max_position_embeddings: 131072,
  },
  siblings: [{ rfilename: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf", size: 4_920_734_368 }],
  benchmarks: { mmlu: 69.4 },
  fetchedAt: "2026-09-14T00:00:00.000Z",
};

describe("assembleModel", () => {
  it("produces a model the app's own schema accepts", () => {
    expect(() => modelSchema.parse(assembleModel(BASE))).not.toThrow();
  });

  it("keeps the canonical repo as the id, not the mirror it was read from", () => {
    const m = assembleModel(BASE);
    expect(m.id).toBe("meta-llama/Llama-3.1-8B-Instruct");
    expect(m.source.archRepo).toBe("unsloth/Meta-Llama-3.1-8B-Instruct");
  });

  it("turns the repo name into a display name", () => {
    expect(assembleModel(BASE).displayName).toBe("Llama 3.1 8B Instruct");
  });

  it("marks a dense model's active params null rather than copying total", () => {
    // total drives memory, active drives speed only. Conflating them is the
    // single most likely way to get an MoE verdict wrong (spec §4).
    expect(assembleModel(BASE).params).toEqual({ total: 8_030_261_248, active: null });
  });

  it("carries a declared active-parameter count for MoE", () => {
    expect(assembleModel({ ...BASE, activeParams: 22_000_000_000 }).params.active).toBe(22_000_000_000);
  });

  it("merges curated benchmarks verbatim, nulls included", () => {
    const m = assembleModel({ ...BASE, benchmarks: { mmlu: 69.4, gpqa: null } });
    expect(m.benchmarks).toEqual({ mmlu: 69.4, gpqa: null });
  });

  it("keeps a measured size measured", () => {
    const q4 = assembleModel(BASE).quants.find((q) => q.id === "Q4_K_M")!;
    expect(q4.sizeSource).toBe("measured");
    expect(q4.sizeBytes).toBe(4_920_734_368);
  });
});
