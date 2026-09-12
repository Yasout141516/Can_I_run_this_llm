import { describe, expect, it } from "vitest";
import { loadGpus, loadLaptops, loadModels } from "../load";

describe("data loading", () => {
  it("loads the shipped models", () => {
    const models = loadModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.map((m) => m.id)).toContain("meta-llama/Llama-3.1-8B-Instruct");
  });

  it("loads GPUs including Apple parts with no discrete VRAM", () => {
    const gpus = loadGpus();
    expect(gpus.find((g) => g.id === "apple-m3-max")?.vramBytes).toBe(0);
  });

  it("loads laptops whose gpuId all resolve or are null", () => {
    const ids = new Set(loadGpus().map((g) => g.id));
    for (const l of loadLaptops()) {
      if (l.gpuId !== null) expect(ids.has(l.gpuId)).toBe(true);
    }
  });

  it("returns the same array identity on repeated calls", () => {
    expect(loadModels()).toBe(loadModels());
  });
});
