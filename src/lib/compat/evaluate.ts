import { DEFAULT_MEMORY_UTILIZATION, getEngine, overheadBytes } from "./engines";
import type { EngineProfile } from "./engines";
import { kvCacheBytes } from "./kvCache";
import { spillCeiling, usableVram } from "./memory";
import { weightBytes } from "./quant";
import type {
  HardwareKind,
  HardwareSpec,
  LimitingFactor,
  ModelSpec,
  QuantOption,
  Settings,
  Verdict,
} from "./types";

/** Locale-independent thousands separators — built-in locale methods would make evaluate() environment-dependent. */
function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const HARDWARE_LABELS: Record<HardwareKind, string> = {
  "discrete-gpu": "a discrete GPU",
  "apple-silicon": "Apple Silicon",
  "cpu-only": "a CPU-only machine",
};

/**
 * Picks the requested quant, or for "auto" the first one the engine can
 * load — data files list quants largest-first, so first means best quality
 * that fits the format.
 */
function pickQuant(
  model: ModelSpec,
  engine: EngineProfile,
  quantId: string,
): QuantOption | null {
  const loadable = model.quants.filter((q) => engine.formats.includes(q.format));
  if (loadable.length === 0) return null;
  if (quantId === "auto") return loadable[0] ?? null;
  return loadable.find((q) => q.id === quantId) ?? null;
}

export function selectQuant(model: ModelSpec, settings: Settings): QuantOption | null {
  return pickQuant(model, getEngine(settings.engine), settings.quantId);
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
  // Guard 0: context length must be a positive whole number of tokens. A
  // UI number input can hand us "-1" or "0" or a fraction; those are
  // nonsensical, not merely "too long", so they are checked first.
  if (!Number.isInteger(settings.contextLength) || settings.contextLength <= 0) {
    return wontRun("context", "Context length must be a positive whole number of tokens.");
  }

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
  const engine = getEngine(settings.engine);

  // Guard: hardware. A model that fits perfectly is still unrunnable if the
  // engine has no backend for this machine.
  if (!engine.runsOn.includes(hw.kind)) {
    return wontRun("engine", `${engine.label} does not run on ${HARDWARE_LABELS[hw.kind]}.`);
  }

  const quant = pickQuant(model, engine, settings.quantId);
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

  // vLLM and SGLang pre-reserve a fraction of VRAM up front and carve KV out
  // of that budget. The question isn't "does the sum fit in VRAM" but "do
  // weights fit inside the reserved pool, with room left for KV". These
  // engines never offload — a miss here is wont-run, never cpu-offloaded.
  if (engine.preReservesKvPool) {
    const utilization = engine.memoryUtilization ?? DEFAULT_MEMORY_UTILIZATION;
    const pool = vram * utilization;
    if (weights + overhead + kv <= pool) {
      return { ...base, status: "run-on-gpu", notes: [] };
    }
    return {
      ...base,
      status: "wont-run",
      limitingFactor: "vram",
      notes: [
        `${engine.label} reserves ${Math.round(utilization * 100)}% of VRAM up front and cannot offload to system RAM.`,
      ],
    };
  }

  if (total <= vram) return { ...base, status: "run-on-gpu", notes: [] };

  if (engine.supportsCpuOffload && total <= spillCeiling(hw)) {
    // Divides weights evenly across layers, ignoring embeddings and the
    // output head (not per-layer tensors). A deliberate approximation: close
    // enough for a layer count.
    const bytesPerLayer = weights / model.arch.numLayers;
    const gpuLayers = Math.min(
      model.arch.numLayers,
      Math.max(0, Math.floor((vram - kv - overhead) / bytesPerLayer)),
    );
    // The layer split only means something on a machine with VRAM to split
    // across. A cpu-only box has none, and a machine where nothing fit is no
    // better described by a "0 of N" split than by saying plainly it all
    // runs from RAM/CPU.
    const note =
      hw.kind === "cpu-only"
        ? "No GPU detected; this model runs entirely on the CPU."
        : gpuLayers === 0
          ? "No layers fit in VRAM; this model runs entirely from system RAM."
          : `${gpuLayers} of ${model.arch.numLayers} layers fit in VRAM; the rest run from system RAM.`;
    return {
      ...base,
      status: "cpu-offloaded",
      gpuLayers,
      limitingFactor: "vram",
      notes: [note],
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
