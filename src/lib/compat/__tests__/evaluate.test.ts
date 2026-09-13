import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { GB } from "../memory";
import { llama8b, llama70b, qwen235bMoe, rtx4070 } from "./fixtures";
import { APPLE_HW, REFERENCE_HW, REFERENCE_SETTINGS } from "../../../features/results/__tests__/fixtures";
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
    expect(v.breakdown!.weightsBytes).toBe(4_920_734_208);
    expect(v.breakdown!.kvCacheBytes).toBe(1_073_741_824);
    expect(v.breakdown!.overheadBytes).toBe(597_456_000);
    expect(v.breakdown!.totalBytes).toBe(6_591_932_032);
  });

  it("reports measured confidence when the size came from a real file", () => {
    expect(v.confidence).toBe("measured");
  });
});

describe("evaluate — CPU offloaded", () => {
  const v = evaluate(llama70b, rtx4070, ollama8k);

  it("offloads a 70B that does not fit VRAM but fits VRAM + usable RAM", () => {
    expect(v.status).toBe("cpu-offloaded");
    expect(v.breakdown!.totalBytes).toBe(45_781_810_560);
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
    expect(v.breakdown!.weightsBytes / GB).toBeCloseTo(141, 0);
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

  it("formats the max-context note with locale-independent grouping", () => {
    // Must not depend on toLocaleString()/ambient locale — same output everywhere.
    const v = evaluate(llama8b, rtx4070, { ...ollama8k, contextLength: 200_000 });
    expect(v.notes[0]).toContain("131,072");
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

describe("evaluate — vLLM pre-reserved KV pool", () => {
  const vllmAwq: Settings = {
    engine: "vllm",
    contextLength: 8192,
    kvPrecision: "fp16",
    quantId: "AWQ-4bit",
  };

  it("fits an AWQ 8B at 8192 context inside the reserved pool", () => {
    const v = evaluate(llama8b, rtx4070, vllmAwq);
    expect(v.status).toBe("run-on-gpu");
  });

  it("does not fit at 131072 context, because of KV — not weights+overhead", () => {
    // weights ~4.27e9 + overhead ~4.35e9 = ~8.61e9, under the 10.8e9 pool on
    // their own. It's kv (17,179,869,184) pushing the sum past the pool that
    // must be what fails this — the case that a dropped kv term would miss.
    const v = evaluate(llama8b, rtx4070, { ...vllmAwq, contextLength: 131_072 });
    expect(v.status).toBe("wont-run");
    expect(v.limitingFactor).toBe("vram");
  });

  it("mentions the reserved percentage in the note", () => {
    const v = evaluate(llama8b, rtx4070, { ...vllmAwq, contextLength: 131_072 });
    expect(v.notes[0]).toContain("90%");
  });

  it("never offloads to CPU, even with ample VRAM+RAM", () => {
    const hugeRam: HardwareSpec = { ...rtx4070, ramBytes: 1_000 * GB };
    const v = evaluate(llama8b, hugeRam, { ...vllmAwq, contextLength: 131_072 });
    expect(v.status).not.toBe("cpu-offloaded");
  });
});

describe("evaluate — context length guard", () => {
  it.each([-1_000_000, 0, 8192.5])("rejects a nonsensical context length: %d", (contextLength) => {
    const v = evaluate(llama8b, rtx4070, { ...ollama8k, contextLength });
    expect(v.status).toBe("wont-run");
    expect(v.limitingFactor).toBe("context");
  });
});

describe("evaluate — cpu-offloaded notes", () => {
  it("does not mention VRAM layers on a cpu-only machine", () => {
    const cpuOnly: HardwareSpec = { kind: "cpu-only", vramBytes: 0, ramBytes: 64 * GB };
    const v = evaluate(llama8b, cpuOnly, ollama8k);
    expect(v.status).toBe("cpu-offloaded");
    expect(v.notes[0]).not.toMatch(/VRAM/);
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

describe("evaluate — engine/hardware compatibility", () => {
  const m3max: HardwareSpec = { kind: "apple-silicon", vramBytes: 0, ramBytes: 64 * GB };

  it("refuses vLLM on Apple Silicon — there is no Metal backend", () => {
    const v = evaluate(llama8b, m3max, {
      ...ollama8k,
      engine: "vllm",
      quantId: "AWQ-4bit",
    });
    expect(v.status).toBe("wont-run");
    expect(v.limitingFactor).toBe("engine");
    expect(v.notes[0]).toMatch(/Apple Silicon|does not run/i);
  });

  it("still allows Ollama on Apple Silicon", () => {
    expect(evaluate(llama8b, m3max, ollama8k).status).toBe("run-on-gpu");
  });

  it("refuses vLLM on a CPU-only machine", () => {
    const cpu: HardwareSpec = { kind: "cpu-only", vramBytes: 0, ramBytes: 32 * GB };
    const v = evaluate(llama8b, cpu, { ...ollama8k, engine: "vllm", quantId: "AWQ-4bit" });
    expect(v.limitingFactor).toBe("engine");
  });
});

describe("evaluate — a too-long context still shows its arithmetic", () => {
  const v = evaluate(llama8b, rtx4070, { ...ollama8k, contextLength: 200_000 });

  it("still refuses, naming the context", () => {
    expect(v.status).toBe("wont-run");
    expect(v.limitingFactor).toBe("context");
  });

  it("reports the weights it would have needed", () => {
    expect(v.breakdown!.weightsBytes).toBe(4_920_734_208);
    expect(v.quantId).toBe("Q4_K_M");
  });

  it("reports the KV cache at the REQUESTED context, which is the whole point", () => {
    // 2 * 32 * 8 * 128 * 200000 * 2
    expect(v.breakdown!.kvCacheBytes).toBe(26_214_400_000);
    expect(v.breakdown!.totalBytes).toBeGreaterThan(v.breakdown!.kvCacheBytes);
  });

  it("leaves the nonsense-context guard returning a null breakdown", () => {
    // -1 tokens has no meaningful arithmetic to show.
    const bad = evaluate(llama8b, rtx4070, { ...ollama8k, contextLength: -1 });
    expect(bad.breakdown).toBeNull();
    expect(bad.limitingFactor).toBe("context");
  });
});

describe("evaluate — breakdown presence", () => {
  it("returns a null breakdown when it never computed one", () => {
    // vLLM cannot run on Apple Silicon: the engine guard returns before any
    // memory arithmetic happens. "No breakdown" is a fact the verdict should
    // state, not something the UI infers from an all-zero object.
    const verdict = evaluate(llama8b, APPLE_HW, { ...REFERENCE_SETTINGS, engine: "vllm" });
    expect(verdict.status).toBe("wont-run");
    expect(verdict.breakdown).toBeNull();
  });

  it("still returns a breakdown when it did the arithmetic", () => {
    const verdict = evaluate(llama8b, REFERENCE_HW, REFERENCE_SETTINGS);
    expect(verdict.breakdown).not.toBeNull();
    expect(verdict.breakdown!.totalBytes).toBe(6_591_932_032);
  });
});
