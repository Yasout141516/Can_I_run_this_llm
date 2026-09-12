import { useMemo } from "react";
import {
  ENGINES,
  GB,
  getEngine,
  type EngineId,
  type KvPrecision,
  type ModelSpec,
} from "../../lib/compat";
import { Field } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { loadModels } from "../../lib/data/load";
import type { useHardwareForm } from "../../hooks/useHardwareForm";
import { DeviceLookup } from "./DeviceLookup";

const KV_OPTIONS: { value: KvPrecision; label: string }[] = [
  { value: "fp16", label: "fp16" },
  { value: "q8", label: "q8" },
  { value: "q4", label: "q4" },
];

/**
 * Only the quantisations this engine can actually load. Offering a GGUF build
 * to vLLM would let the user configure something that cannot exist, and the
 * resulting verdict note would tell them the model has no quantisations at all
 * — which is untrue. Filtering here is what keeps that message honest.
 */
export function quantOptionsFor(models: ModelSpec[], engineId: EngineId): string[] {
  const { formats } = getEngine(engineId);
  const ids = new Set<string>();
  for (const m of models) {
    for (const q of m.quants) if (formats.includes(q.format)) ids.add(q.id);
  }
  return [...ids].sort();
}

/** Inputs are in GB because that is how people read spec sheets. */
function gbInput(value: number): number {
  return Math.round(value / GB);
}

export function HardwarePanel({ form }: { form: ReturnType<typeof useHardwareForm> }) {
  const { hw, settings, setHw, setSettings, applyGpu, applyLaptop } = form;
  const quantIds = useMemo(() => quantOptionsFor(loadModels(), settings.engine), [settings.engine]);

  function changeEngine(engine: EngineId) {
    // A quant the new engine cannot load would be a dead selection, so drop
    // back to auto rather than leaving a stale id in form state.
    const stillLoadable = quantOptionsFor(loadModels(), engine).includes(settings.quantId);
    setSettings({ engine, quantId: stillLoadable ? settings.quantId : "auto" });
  }

  return (
    <section className="panel hardware-panel" aria-label="Your hardware">
      <DeviceLookup onPickGpu={applyGpu} onPickLaptop={applyLaptop} />

      <Field label="VRAM (GB)" htmlFor="vram" help="Video memory on your graphics card.">
        <input
          id="vram"
          className="input"
          type="number"
          min={0}
          value={gbInput(hw.vramBytes)}
          onChange={(e) => setHw({ vramBytes: Number(e.target.value) * GB })}
        />
      </Field>

      <Field label="System RAM (GB)" htmlFor="ram">
        <input
          id="ram"
          className="input"
          type="number"
          min={1}
          value={gbInput(hw.ramBytes)}
          onChange={(e) => setHw({ ramBytes: Number(e.target.value) * GB })}
        />
      </Field>

      <Field
        label="Inference engine"
        htmlFor="engine"
        help="Decides which quantised formats are offered and whether the model can offload into ordinary memory."
      >
        <select
          id="engine"
          className="select"
          value={settings.engine}
          onChange={(e) => changeEngine(e.target.value as EngineId)}
        >
          {Object.values(ENGINES).map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Quantisation"
        htmlFor="quant"
        help="Smaller formats shrink the weights at some cost to quality. Only formats your engine can load are offered."
      >
        <select
          id="quant"
          className="select"
          value={settings.quantId}
          onChange={(e) => setSettings({ quantId: e.target.value })}
        >
          <option value="auto">Auto (best available)</option>
          {quantIds.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Context length (tokens)"
        htmlFor="ctx"
        help="How much text the model keeps in mind. Longer contexts need more memory."
      >
        <input
          id="ctx"
          className="input"
          type="number"
          min={1}
          step={1024}
          value={settings.contextLength}
          onChange={(e) => setSettings({ contextLength: Number(e.target.value) })}
        />
      </Field>

      <Field
        label="KV cache precision"
        help="Every token is remembered in a cache that lives in graphics memory. Dropping fp16 to q8 halves it."
      >
        <Segmented
          label="KV cache precision"
          options={KV_OPTIONS}
          value={settings.kvPrecision}
          onChange={(kvPrecision) => setSettings({ kvPrecision })}
        />
      </Field>
    </section>
  );
}
