import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  ENGINES,
  GB,
  getEngine,
  usableVram,
  type EngineId,
  type HardwareKind,
  type KvPrecision,
  type ModelSpec,
} from "../../lib/compat";
import { Field, helpId } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { formatGB } from "../../lib/ui/format";
import { loadModels } from "../../lib/data/load";
import type { useHardwareForm } from "../../hooks/useHardwareForm";
import { DeviceLookup } from "./DeviceLookup";

const KV_OPTIONS: { value: KvPrecision; label: string }[] = [
  { value: "fp16", label: "fp16" },
  { value: "q8", label: "q8" },
  { value: "q4", label: "q4" },
];

const KIND_OPTIONS: { value: HardwareKind; label: string }[] = [
  { value: "discrete-gpu", label: "Discrete GPU" },
  { value: "apple-silicon", label: "Apple Silicon" },
  { value: "cpu-only", label: "CPU only" },
];

/**
 * A plain controlled `<input value={domainValue}>` fights a mid-edit clear:
 * React resyncs the DOM to the last committed value on every keystroke, so
 * clearing the field to retype silently reverts and the next digit lands on
 * the stale number instead of a fresh one. This hook keeps its own draft text
 * in sync with whatever is on screen and only forwards a value upstream once
 * it parses to a real number — a blank field or malformed text ("1e") is
 * left uncommitted rather than coerced to 0 or NaN, which would otherwise
 * flip every model to a "Won't run" verdict whose reason has nothing to do
 * with what the user actually typed.
 */
function useNumericField(domainValue: number, commit: (n: number) => void) {
  const [text, setText] = useState(() => String(domainValue));

  // Resync when the domain value changes for a reason other than this
  // field's own typing — a preset, a lookup, another control.
  useEffect(() => {
    setText(String(domainValue));
  }, [domainValue]);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    commit(n);
  }

  return { value: text, onChange };
}

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

  const vramField = useNumericField(gbInput(hw.vramBytes), (n) => setHw({ vramBytes: n * GB }));
  const ramField = useNumericField(gbInput(hw.ramBytes), (n) => setHw({ ramBytes: n * GB }));
  const ctxField = useNumericField(settings.contextLength, (n) => setSettings({ contextLength: n }));

  function changeEngine(engine: EngineId) {
    // A quant the new engine cannot load would be a dead selection, so drop
    // back to auto rather than leaving a stale id in form state.
    const stillLoadable = quantOptionsFor(loadModels(), engine).includes(settings.quantId);
    setSettings({ engine, quantId: stillLoadable ? settings.quantId : "auto" });
  }

  return (
    <section className="panel hardware-panel" aria-label="Your hardware">
      <DeviceLookup onPickGpu={applyGpu} onPickLaptop={applyLaptop} />

      <Field
        label="Device type"
        htmlFor="kind"
        help="Apple Silicon shares one pool of memory between the CPU and GPU. CPU-only machines have no GPU to load a model into."
      >
        <select
          id="kind"
          className="select"
          value={hw.kind}
          aria-describedby={helpId("kind")}
          onChange={(e) => setHw({ kind: e.target.value as HardwareKind })}
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {hw.kind === "apple-silicon" ? (
        <p className="hint" data-testid="unified-vram-note">
          Unified memory — the GPU can use {formatGB(usableVram(hw))} of your{" "}
          {formatGB(hw.ramBytes)}.
        </p>
      ) : hw.kind === "cpu-only" ? (
        <p className="hint" data-testid="no-gpu-note">
          No GPU — everything runs from system RAM.
        </p>
      ) : (
        <Field label="VRAM (GB)" htmlFor="vram" help="Video memory on your graphics card.">
          <input
            id="vram"
            className="input"
            type="number"
            min={0}
            value={vramField.value}
            aria-describedby={helpId("vram")}
            onChange={vramField.onChange}
          />
        </Field>
      )}

      <Field label="System RAM (GB)" htmlFor="ram">
        <input
          id="ram"
          className="input"
          type="number"
          min={1}
          value={ramField.value}
          onChange={ramField.onChange}
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
          aria-describedby={helpId("engine")}
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
          aria-describedby={helpId("quant")}
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
          value={ctxField.value}
          aria-describedby={helpId("ctx")}
          onChange={ctxField.onChange}
        />
      </Field>

      <Field
        label="KV cache precision"
        htmlFor="kv"
        help="Every token is remembered in a cache that lives in graphics memory. Dropping fp16 to q8 halves it."
      >
        <Segmented
          label="KV cache precision"
          options={KV_OPTIONS}
          value={settings.kvPrecision}
          onChange={(kvPrecision) => setSettings({ kvPrecision })}
          describedBy={helpId("kv")}
        />
      </Field>
    </section>
  );
}
