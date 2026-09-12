import type { EngineId, QuantFormat } from "./types";

export interface EngineProfile {
  id: EngineId;
  label: string;
  formats: QuantFormat[];
  supportsCpuOffload: boolean;
  preReservesKvPool: boolean;
  memoryUtilization?: number;
  /**
   * CUDA/driver context plus activation and compute buffers. These are the
   * least certain numbers in the engine and the ones most likely to be tuned
   * against real-world reports — which is exactly why they live here, named,
   * instead of as literals inside the math.
   */
  overhead: { baseBytes: number; perContextBytes: number };
}

const GGUF_OVERHEAD = { baseBytes: 450_000_000, perContextBytes: 18_000 };
const SERVER_OVERHEAD = { baseBytes: 1_200_000_000, perContextBytes: 24_000 };

export const ENGINES: Readonly<Record<EngineId, EngineProfile>> = {
  ollama: {
    id: "ollama",
    label: "Ollama",
    formats: ["gguf"],
    supportsCpuOffload: true,
    preReservesKvPool: false,
    overhead: GGUF_OVERHEAD,
  },
  llamacpp: {
    id: "llamacpp",
    label: "llama.cpp",
    formats: ["gguf"],
    supportsCpuOffload: true,
    preReservesKvPool: false,
    overhead: GGUF_OVERHEAD,
  },
  koboldcpp: {
    id: "koboldcpp",
    label: "KoboldCpp",
    formats: ["gguf"],
    supportsCpuOffload: true,
    preReservesKvPool: false,
    overhead: GGUF_OVERHEAD,
  },
  vllm: {
    id: "vllm",
    label: "vLLM",
    formats: ["awq", "gptq", "fp8", "safetensors"],
    supportsCpuOffload: false,
    preReservesKvPool: true,
    memoryUtilization: 0.9,
    overhead: SERVER_OVERHEAD,
  },
  tgi: {
    id: "tgi",
    label: "TGI",
    formats: ["awq", "gptq", "safetensors"],
    supportsCpuOffload: false,
    preReservesKvPool: false,
    overhead: SERVER_OVERHEAD,
  },
  sglang: {
    id: "sglang",
    label: "SGLang",
    formats: ["awq", "gptq", "fp8", "safetensors"],
    supportsCpuOffload: false,
    preReservesKvPool: true,
    memoryUtilization: 0.9,
    overhead: SERVER_OVERHEAD,
  },
};

export function getEngine(id: EngineId): EngineProfile {
  return ENGINES[id];
}

export function overheadBytes(engine: EngineProfile, contextLength: number): number {
  return engine.overhead.baseBytes + engine.overhead.perContextBytes * contextLength;
}
