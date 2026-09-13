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
 * it parses to a real, complete number:
 *  - a blank field is left uncommitted rather than coerced to 0
 *  - malformed text ("abc") is left uncommitted rather than written as NaN
 *  - a still-incomplete number ("4.", a lone "-") parses fine today
 *    (`Number("4.") === 4`) but committing it early buys nothing and, once
 *    `domainValue` is compared back against the draft below, must not be
 *    treated as if the user were done typing
 * either of which would otherwise flip every model to a "Won't run" verdict
 * whose reason has nothing to do with what the user actually typed.
 *
 * The resync effect only overwrites the draft when `domainValue` changed for
 * a reason OTHER than this field's own last commit (a preset, a lookup,
 * another control): it compares the incoming value against what the current
 * draft already parses to, not against some rounded display form of it. A
 * naive "always resync to the rounded display value" would clobber an
 * in-progress decimal — typing "4.5" would commit 4.5 correctly but then get
 * redisplayed as the rounded "5" the moment that render's effect ran.
 */
function useNumericField(domainValue: number, commit: (n: number) => void) {
  const [text, setText] = useState(() => String(domainValue));

  useEffect(() => {
    // Deliberately depends only on `domainValue`, not `text`: this should
    // react to an EXTERNAL change (the domain value moving for some reason
    // other than what's already on screen), not to every local keystroke —
    // re-running on every `text` change would re-clobber a field the moment
    // it goes blank or momentarily invalid while the user is still typing,
    // which is the exact bug this hook exists to prevent. The comparison
    // still reads the current `text` via closure, which is always this
    // render's latest value regardless of the dependency list.
    const parsed = Number(text);
    if (!Number.isNaN(parsed) && parsed === domainValue) return;
    setText(String(domainValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainValue]);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    if (raw.trim() === "" || raw.endsWith(".") || raw === "-") return;
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

export function HardwarePanel({ form }: { form: ReturnType<typeof useHardwareForm> }) {
  const { hw, settings, setHw, setSettings, applyGpu, applyLaptop } = form;
  const quantIds = useMemo(() => quantOptionsFor(loadModels(), settings.engine), [settings.engine]);

  // The exact value in GB, not rounded to a whole number: useNumericField
  // compares this against the parsed draft to decide whether a change came
  // from outside (a preset) or is just this field's own commit echoing
  // back — rounding it here would make a fractional GB (7.5, 4.05, ...)
  // permanently indistinguishable from its own echo and get redisplayed
  // rounded mid-keystroke.
  const vramField = useNumericField(hw.vramBytes / GB, (n) => setHw({ vramBytes: n * GB }));
  const ramField = useNumericField(hw.ramBytes / GB, (n) => setHw({ ramBytes: n * GB }));
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
