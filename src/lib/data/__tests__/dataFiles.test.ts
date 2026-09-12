import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gpusFileSchema, laptopsFileSchema, modelsFileSchema } from "../schema";

const load = (p: string) => JSON.parse(readFileSync(p, "utf8"));

describe("shipped data files", () => {
  it("validates data/models.json", () => {
    const r = modelsFileSchema.safeParse(load("data/models.json"));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues, null, 2)).toBe(true);
  });

  it("validates data/gpus.json", () => {
    const r = gpusFileSchema.safeParse(load("data/gpus.json"));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues, null, 2)).toBe(true);
  });

  it("validates data/laptops.json", () => {
    const r = laptopsFileSchema.safeParse(load("data/laptops.json"));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues, null, 2)).toBe(true);
  });

  it("gives every laptop a gpuId that exists, or null", () => {
    const gpus = new Set(load("data/gpus.json").gpus.map((g: { id: string }) => g.id));
    for (const l of load("data/laptops.json").laptops) {
      if (l.gpuId !== null) expect(gpus.has(l.gpuId), `unknown gpuId: ${l.gpuId}`).toBe(true);
    }
  });

  it("gives every model at least one quantisation", () => {
    for (const m of load("data/models.json").models) {
      expect(m.quants.length, `${m.id} has no quants`).toBeGreaterThan(0);
    }
  });
});
