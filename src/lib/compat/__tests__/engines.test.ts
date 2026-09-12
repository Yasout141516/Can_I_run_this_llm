import { describe, expect, it } from "vitest";
import { ENGINES, getEngine, overheadBytes } from "../engines";
import type { EngineId } from "../types";

const ALL: EngineId[] = ["ollama", "llamacpp", "koboldcpp", "vllm", "tgi", "sglang"];

describe("ENGINES", () => {
  it("defines a profile for every engine id", () => {
    for (const id of ALL) expect(ENGINES[id]).toBeDefined();
  });

  it("gives GGUF engines CPU offload and vLLM none", () => {
    expect(getEngine("ollama").supportsCpuOffload).toBe(true);
    expect(getEngine("llamacpp").supportsCpuOffload).toBe(true);
    expect(getEngine("koboldcpp").supportsCpuOffload).toBe(true);
    expect(getEngine("vllm").supportsCpuOffload).toBe(false);
    expect(getEngine("tgi").supportsCpuOffload).toBe(false);
  });

  it("accepts GGUF only on the llama.cpp family", () => {
    expect(getEngine("ollama").formats).toContain("gguf");
    expect(getEngine("vllm").formats).not.toContain("gguf");
    expect(getEngine("sglang").formats).not.toContain("gguf");
  });

  it("marks vLLM and SGLang as pre-reserving a KV pool", () => {
    expect(getEngine("vllm").preReservesKvPool).toBe(true);
    expect(getEngine("sglang").preReservesKvPool).toBe(true);
    expect(getEngine("ollama").preReservesKvPool).toBe(false);
  });

  it("gives every pool-reserving engine a memoryUtilization fraction", () => {
    for (const id of ALL) {
      const e = getEngine(id);
      if (e.preReservesKvPool) expect(e.memoryUtilization).toBeGreaterThan(0);
    }
  });
});

describe("overheadBytes", () => {
  it("computes Ollama at 8K context as ~0.60 GB", () => {
    expect(overheadBytes(getEngine("ollama"), 8192)).toBe(597_456_000);
  });

  it("grows with context length", () => {
    const e = getEngine("ollama");
    expect(overheadBytes(e, 16_384)).toBeGreaterThan(overheadBytes(e, 8192));
  });
});

describe("runsOn", () => {
  it("lets the llama.cpp family run anywhere", () => {
    for (const id of ["ollama", "llamacpp", "koboldcpp"] as const) {
      expect(getEngine(id).runsOn).toEqual(
        expect.arrayContaining(["discrete-gpu", "apple-silicon", "cpu-only"]),
      );
    }
  });

  it("restricts the server engines to discrete GPUs", () => {
    for (const id of ["vllm", "tgi", "sglang"] as const) {
      expect(getEngine(id).runsOn).toEqual(["discrete-gpu"]);
    }
  });
});
