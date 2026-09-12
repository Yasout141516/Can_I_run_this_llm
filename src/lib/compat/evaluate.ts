import { getEngine, overheadBytes } from "./engines";
import { kvCacheBytes } from "./kvCache";
import { APPLE_SOFT_CEILING, usableRam, usableVram } from "./memory";
import { weightBytes } from "./quant";
import type {
  HardwareSpec,
  LimitingFactor,
  ModelSpec,
  QuantOption,
  Settings,
  Verdict,
} from "./types";

/** vLLM/SGLang's default `gpu_memory_utilization` when a profile doesn't override it. */
const DEFAULT_MEMORY_UTILIZATION = 0.9;

/** Locale-independent thousands separators — `toLocaleString` would make evaluate() environment-dependent. */
function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Picks the requested quant, or for "auto" the first one the engine can
 * load — data files list quants largest-first, so first means best quality
 * that fits the format.
 */
export function selectQuant(model: ModelSpec, settings: Settings): QuantOption | null {
  const engine = getEngine(settings.engine);
  const loadable = model.quants.filter((q) => engine.formats.includes(q.format));
  if (loadable.length === 0) return null;
  if (settings.quantId === "auto") return loadable[0] ?? null;
  return loadable.find((q) => q.id === settings.quantId) ?? null;
}

function wontRun(reason: LimitingFactor, note: string): Verdict {
  return {
    status: "wont-run",
    breakdown: { weightsBytes: 0, kvCacheBytes: 0, overheadBytes: 0, totalBytes: 0 },
    confidence: "estimated",
    quantId: null,
    limitingFactor: reason,
    notes: [note],
  };
}

export function evaluate(model: ModelSpec, hw: HardwareSpec, settings: Settings): Verdict {
  // Guard 1: context length. Checked before quant selection — a context that
  // is too long is disqualifying no matter what the model can be squeezed into.
  if (settings.contextLength > model.arch.maxContext) {
    return wontRun(
      "context",
      `This model supports up to ${groupDigits(model.arch.maxContext)} tokens.`,
    );
  }

  // Guard 2: format. If the engine cannot load any quant this model ships,
  // there is nothing left to size.
  const quant = selectQuant(model, settings);
  const engine = getEngine(settings.engine);
  if (!quant) {
    return wontRun("format", `${engine.label} cannot load any quantisation of this model.`);
  }

  const weights = weightBytes(model, quant);
  const kv = kvCacheBytes(model.arch, settings.contextLength, settings.kvPrecision);
  const overhead = overheadBytes(engine, settings.contextLength);
  const total = weights + kv + overhead;

  const breakdown = {
    weightsBytes: weights,
    kvCacheBytes: kv,
    overheadBytes: overhead,
    totalBytes: total,
  };
  const base = { breakdown, confidence: quant.sizeSource, quantId: quant.id };

  const vram = usableVram(hw);
  const notes: string[] = [];

  // vLLM and SGLang pre-reserve a fraction of VRAM up front and carve KV out
  // of that budget. The question isn't "does the sum fit in VRAM" but "do
  // weights fit inside the reserved pool, with room left for KV". These
  // engines never offload — a miss here is wont-run, never cpu-offloaded.
  if (engine.preReservesKvPool) {
    const pool = vram * (engine.memoryUtilization ?? DEFAULT_MEMORY_UTILIZATION);
    if (weights + overhead <= pool && kv <= pool - weights - overhead) {
      return { ...base, status: "run-on-gpu", notes };
    }
    return {
      ...base,
      status: "wont-run",
      limitingFactor: "vram",
      notes: [
        `${engine.label} reserves ${Math.round((engine.memoryUtilization ?? DEFAULT_MEMORY_UTILIZATION) * 100)}% of VRAM up front and cannot offload to system RAM.`,
      ],
    };
  }

  if (total <= vram) return { ...base, status: "run-on-gpu", notes };

  // Apple Silicon has no VRAM/RAM boundary to spill across — usableRam is 0
  // there. Its ceiling is a fraction of the single unified pool, not
  // usableVram + usableRam, which would double-count the same physical bytes.
  const spillCeiling =
    hw.kind === "apple-silicon" ? hw.ramBytes * APPLE_SOFT_CEILING : vram + usableRam(hw);

  if (engine.supportsCpuOffload && total <= spillCeiling) {
    // Divides weights evenly across layers, ignoring embeddings and the
    // output head (not per-layer tensors). A deliberate approximation: close
    // enough for a layer count.
    const bytesPerLayer = weights / model.arch.numLayers;
    const gpuLayers = Math.min(
      model.arch.numLayers,
      Math.max(0, Math.floor((vram - kv - overhead) / bytesPerLayer)),
    );
    return {
      ...base,
      status: "cpu-offloaded",
      gpuLayers,
      limitingFactor: "vram",
      notes: [
        `${gpuLayers} of ${model.arch.numLayers} layers fit in VRAM; the rest run from system RAM.`,
      ],
    };
  }

  return {
    ...base,
    status: "wont-run",
    limitingFactor: engine.supportsCpuOffload ? "ram" : "vram",
    notes: engine.supportsCpuOffload
      ? ["Exceeds VRAM and usable system RAM combined."]
      : [`${engine.label} cannot offload to system RAM.`],
  };
}
