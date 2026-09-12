import type { EngineId, HardwareKind, QuantFormat } from "./types";

/**
 * vLLM/SGLang's documented default for `gpu_memory_utilization`, used when a
 * profile below does not override it.
 */
export const DEFAULT_MEMORY_UTILIZATION = 0.9;

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
  /**
   * Hardware this engine has a backend for. vLLM, TGI and SGLang are CUDA/ROCm
   * server runtimes with no Metal path, so "it fits in memory" is not the only
   * question a Mac user needs answered.
   */
  runsOn: HardwareKind[];
}

const GGUF_OVERHEAD = { baseBytes: 450_000_000, perContextBytes: 18_000 };
const SERVER_OVERHEAD = { baseBytes: 1_200_000_000, perContextBytes: 24_000 };
const ANY_HARDWARE: HardwareKind[] = ["discrete-gpu", "apple-silicon", "cpu-only"];
const DISCRETE_GPU_ONLY: HardwareKind[] = ["discrete-gpu"];

export const ENGINES: Readonly<Record<EngineId, EngineProfile>> = {
  ollama: {
    id: "ollama",
    label: "Ollama",
    formats: ["gguf"],
    supportsCpuOffload: true,
    preReservesKvPool: false,
    overhead: GGUF_OVERHEAD,
    runsOn: ANY_HARDWARE,
  },
  llamacpp: {
    id: "llamacpp",
    label: "llama.cpp",
    formats: ["gguf"],
    supportsCpuOffload: true,
    preReservesKvPool: false,
    overhead: GGUF_OVERHEAD,
    runsOn: ANY_HARDWARE,
  },
  koboldcpp: {
    id: "koboldcpp",
    label: "KoboldCpp",
    formats: ["gguf"],
    supportsCpuOffload: true,
    preReservesKvPool: false,
    overhead: GGUF_OVERHEAD,
    runsOn: ANY_HARDWARE,
  },
  vllm: {
    id: "vllm",
    label: "vLLM",
    formats: ["awq", "gptq", "fp8", "safetensors"],
    supportsCpuOffload: false,
    preReservesKvPool: true,
    memoryUtilization: DEFAULT_MEMORY_UTILIZATION,
    overhead: SERVER_OVERHEAD,
    runsOn: DISCRETE_GPU_ONLY,
  },
  tgi: {
    id: "tgi",
    label: "TGI",
    formats: ["awq", "gptq", "safetensors"],
    supportsCpuOffload: false,
    preReservesKvPool: false,
    overhead: SERVER_OVERHEAD,
    runsOn: DISCRETE_GPU_ONLY,
  },
  sglang: {
    id: "sglang",
    label: "SGLang",
    formats: ["awq", "gptq", "fp8", "safetensors"],
    supportsCpuOffload: false,
    preReservesKvPool: true,
    memoryUtilization: DEFAULT_MEMORY_UTILIZATION,
    overhead: SERVER_OVERHEAD,
    runsOn: DISCRETE_GPU_ONLY,
  },
};

export function getEngine(id: EngineId): EngineProfile {
  return ENGINES[id];
}

export function overheadBytes(engine: EngineProfile, contextLength: number): number {
  return engine.overhead.baseBytes + engine.overhead.perContextBytes * contextLength;
}
