import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { GB } from "../memory";
import { llama8b, llama70b, qwen235bMoe, rtx4070 } from "./fixtures";
import type { HardwareSpec, ModelSpec, Settings } from "../types";

const ollama8k: Settings = {
  engine: "ollama",
  contextLength: 8192,
  kvPrecision: "fp16",
  quantId: "Q4_K_M",
};

describe("evaluate — run on GPU", () => {
  const v = evaluate(llama8b, rtx4070, ollama8k);

  it("fits an 8B Q4_K_M on a 12 GB card", () => {
    expect(v.status).toBe("run-on-gpu");
  });

  it("breaks the total down exactly", () => {
    expect(v.breakdown.weightsBytes).toBe(4_920_734_208);
    expect(v.breakdown.kvCacheBytes).toBe(1_073_741_824);
    expect(v.breakdown.overheadBytes).toBe(597_456_000);
    expect(v.breakdown.totalBytes).toBe(6_591_932_032);
  });

  it("reports measured confidence when the size came from a real file", () => {
    expect(v.confidence).toBe("measured");
  });
});

describe("evaluate — CPU offloaded", () => {
  const v = evaluate(llama70b, rtx4070, ollama8k);

  it("offloads a 70B that does not fit VRAM but fits VRAM + usable RAM", () => {
    expect(v.status).toBe("cpu-offloaded");
    expect(v.breakdown.totalBytes).toBe(45_781_810_560);
  });

  it("reports the layer split that --n-gpu-layers needs", () => {
    expect(v.gpuLayers).toBe(16);
  });

  it("names VRAM as the limiting factor", () => {
    expect(v.limitingFactor).toBe("vram");
  });
});

describe("evaluate — won't run", () => {
  const v = evaluate(qwen235bMoe, rtx4070, ollama8k);

  it("rejects a 235B MoE that exceeds VRAM + usable RAM", () => {
    expect(v.status).toBe("wont-run");
    expect(v.limitingFactor).toBe("ram");
  });

  it("charges MoE memory at total params, not active", () => {
    expect(v.breakdown.weightsBytes / GB).toBeCloseTo(141, 0);
  });

  it("reports estimated confidence when no real file exists", () => {
    expect(v.confidence).toBe("estimated");
  });
});

describe("evaluate — guard clauses", () => {
  it("refuses a context longer than the model supports", () => {
    const v = evaluate(llama8b, rtx4070, { ...ollama8k, contextLength: 200_000 });
    expect(v.status).toBe("wont-run");
    expect(v.limitingFactor).toBe("context");
  });

  it("refuses a model with no quant the engine can load", () => {
    const v = evaluate(llama70b, rtx4070, { ...ollama8k, engine: "vllm", quantId: "auto" });
    expect(v.status).toBe("wont-run");
    expect(v.limitingFactor).toBe("format");
  });

  it("will not offload on an engine that cannot", () => {
    // Give it AWQ so TGI can actually load it. With the GGUF-only fixture this
    // would trip the format guard and never reach the no-offload path at all.
    const awqOnly: ModelSpec = {
      ...llama70b,
      quants: [{ id: "AWQ-4bit", format: "awq", sizeBytes: 0, sizeSource: "estimated" }],
    };
    const hw: HardwareSpec = { ...rtx4070, vramBytes: 24 * GB };
    const v = evaluate(awqOnly, hw, { ...ollama8k, engine: "tgi", quantId: "AWQ-4bit" });
    expect(v.status).toBe("wont-run");
    expect(v.limitingFactor).toBe("vram");
  });
});

describe("evaluate — Apple Silicon", () => {
  const m3max: HardwareSpec = { kind: "apple-silicon", vramBytes: 0, ramBytes: 64 * GB };

  it("runs a 70B on a 64 GB unified pool, inside the wired limit", () => {
    // 45.78 GB needed vs 48 GB wired limit (64 * 0.75)
    expect(evaluate(llama70b, m3max, ollama8k).status).toBe("run-on-gpu");
  });

  it("does not add system RAM on top of the unified pool", () => {
    const small: HardwareSpec = { kind: "apple-silicon", vramBytes: 0, ramBytes: 16 * GB };
    expect(evaluate(llama70b, small, ollama8k).status).toBe("wont-run");
  });
});
