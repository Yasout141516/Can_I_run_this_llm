# Calculator UI & Model Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the merged compatibility engine into a usable app — a live calculator that buckets every tracked model into Run on GPU / CPU Offloaded / Won't Run, and a per-model report that shows the arithmetic behind the verdict.

**Architecture:** React + react-router over the existing pure `src/lib/compat/`. Two prerequisite engine changes land first (engine×hardware compatibility, and computing the memory breakdown before the context guard), then a token-driven pixel design system, then the calculator route and the report route. Form state is the single source of truth; lookups prefill it and never lock it. No submit button — every input change re-runs `evaluate()` across all models.

**Tech Stack:** React 18, react-router-dom 6, TypeScript 5, Vite 5, Vitest 2 + @testing-library/react, jsdom. No component library, no CSS framework.

**Spec:** [`docs/superpowers/specs/2026-09-12-llm-hardware-compatibility-checker-design.md`](../specs/2026-09-12-llm-hardware-compatibility-checker-design.md)

**Carried forward:** [`docs/superpowers/notes/2026-09-12-carried-into-plan-2.md`](../notes/2026-09-12-carried-into-plan-2.md) — read it; three of its items are Tasks 1, 2 and 10 here.

**Visual reference:** [`docs/design/style-reference.html`](../../design/style-reference.html) — the approved pixel system, with live examples of every component this plan builds. Open it before Task 4.

## Global Constraints

- **Node 20+.**
- **No network calls at runtime.** All data is static JSON bundled at build time.
- **`src/lib/compat/` stays pure** — no React, `fetch`, `node:fs`, `Date.now()`/`new Date()`, `toLocaleString`, `Math.random`, `performance.now`, `Intl.`, `process.`, `window.`, `localStorage`. A purity test enforces this by scanning source text, comments included. Tasks 1 and 2 modify this module and must keep it passing.
- **Bytes internally, decimal GB at the edges.** `1 GB = 1_000_000_000`. Never GiB.
- **Named constants, never literals** for tunable values.
- **Three golden anchors must not move:** `6_591_932_032`, `45_781_810_560`, `gpuLayers` = 16.
- **Status is never carried by colour alone.** Every verdict shows a glyph, a word, and a colour.
- **The UI never re-implements the math.** Anything derivable from `evaluate()` comes from `evaluate()`.
- **A lookup prefills form state and then has no authority.** There is no locked state; overriding a prefilled value is just typing.
- **TDD throughout.** Test first, watch it fail, minimal implementation, watch it pass.
- **Commit after every task.** Conventional commit messages.

## Decisions this plan implements

Three questions were settled before writing it:

| Question | Decision | Task |
|---|---|---|
| Where does engine×hardware compatibility live? | A `runsOn` field on `EngineProfile`; `evaluate()` returns won't-run | 1 |
| Context-too-long returns an all-zero breakdown | Compute the breakdown first, then guard — so the report can draw it | 2 |
| How much UI in this plan? | Calculator + model report. Coach-marks, benchmarks page and `/detect` stay in Plan 4 | — |

## Adopted from the reference sites

Checked directly against `llmrun.dev` while writing this plan:

- **VRAM need *and* percentage of the user's card** in each result row (`6.59 GB · 55%`), not bytes alone — it makes "close to the line" legible at a glance. Task 7.
- **The model page lists VRAM for every quantisation**, not just the selected one. We already hold the quant array and `evaluate()`, so this is nearly free. Task 10.
- **Hardware dropdown at the top, results live below, one page, no submit.** Tasks 6 and 9.

Checked against `canirun.ai`, which splits results three ways as **"Can run" / "Tight fit" /
"Too heavy"**:

- **A "tight fit" signal.** Our three buckets stay as they are — that contract is in the
  spec and the engine is tested against it — but a model consuming 94% of VRAM technically
  "runs on GPU" and will still OOM the moment a browser touches the card. That is a
  presentation concern derived from the percentage we already compute, so it goes on the
  card as a flag, not into `evaluate()` as a fourth status. Task 7.
- **A real empty state when nothing fits.** `canirun.ai` says "This device is very
  constrained… Nothing runs comfortably yet" and points somewhere useful, rather than
  showing an empty list. Task 7.
- **Creator and context length on the row.** Both are already in `ModelSpec` (`source.hfRepo`
  carries the org; `arch.maxContext` the context). Cheap, and they are the two fields a
  scanner actually uses to tell models apart. Task 7.

Its filter-by-licence, sort-by-newest and popularity axes need `license`, `releasedAt` and
download counts, which `ModelSpec` does not carry. **Noted for Plan 3's ingestion work** —
not buildable here.

## File structure

```
src/lib/compat/types.ts          (modify)  HardwareKind, LimitingFactor += "engine"
src/lib/compat/engines.ts        (modify)  runsOn per profile
src/lib/compat/evaluate.ts       (modify)  engine guard; breakdown before context guard
src/lib/data/schema.ts           (modify)  export gpuSchema / laptopSchema for type inference
src/lib/data/load.ts             (new)     load + validate the three JSON files once
src/lib/ui/format.ts             (new)     bytes → "4.92 GB", percentages, token counts
src/styles/tokens.css            (new)     the pixel design system as CSS custom properties
src/components/ui/*.tsx          (new)     Button, Pill, Badge, HelpDot, Field, Segmented, Chip
src/hooks/useHardwareForm.ts     (new)     form state is truth; lookups prefill
src/features/hardware/*.tsx      (new)     HardwarePanel, DeviceLookup
src/features/results/*.tsx       (new)     StatTiles, Filters, ModelList, ModelCard, ModelTable
src/features/report/*.tsx        (new)     ModelReport, MemoryBar, QuantTable, RunItBlock
src/App.tsx                      (modify)  routes + shell
```

---

### Task 1: Engine × hardware compatibility

**Files:**
- Modify: `src/lib/compat/types.ts`, `src/lib/compat/engines.ts`, `src/lib/compat/evaluate.ts`
- Test: `src/lib/compat/__tests__/engines.test.ts`, `src/lib/compat/__tests__/evaluate.test.ts`

**Interfaces:**
- Consumes: `EngineProfile`, `HardwareSpec`, `evaluate` as they exist on `main`
- Produces: `HardwareKind` type; `EngineProfile.runsOn: HardwareKind[]`; `LimitingFactor` gains `"engine"`

Today `evaluate()` returns `run-on-gpu` for vLLM on Apple Silicon. vLLM has no Metal backend, so that verdict is simply false. The fix goes in the engine table, not the UI, so the rule is tested once and every future consumer inherits it.

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/lib/compat/__tests__/engines.test.ts
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
```

```ts
// append to src/lib/compat/__tests__/evaluate.test.ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/compat/__tests__/engines.test.ts src/lib/compat/__tests__/evaluate.test.ts`
Expected: FAIL — `runsOn` is undefined, and the vLLM/Apple case currently returns `run-on-gpu`.

- [ ] **Step 3: Add `HardwareKind` and extend `LimitingFactor`**

In `src/lib/compat/types.ts`, add above `HardwareSpec` and update both:

```ts
export type HardwareKind = "discrete-gpu" | "apple-silicon" | "cpu-only";
```

Change `HardwareSpec.kind` to `kind: HardwareKind;` and extend:

```ts
export type LimitingFactor = "vram" | "ram" | "context" | "format" | "engine";
```

- [ ] **Step 4: Add `runsOn` to every engine profile**

In `src/lib/compat/engines.ts`, import `HardwareKind` alongside the existing type imports, add the field to the interface with a comment explaining why it exists:

```ts
  /**
   * Hardware this engine has a backend for. vLLM, TGI and SGLang are CUDA/ROCm
   * server runtimes with no Metal path, so "it fits in memory" is not the only
   * question a Mac user needs answered.
   */
  runsOn: HardwareKind[];
```

Add a shared constant near `GGUF_OVERHEAD` and use it:

```ts
const ANY_HARDWARE: HardwareKind[] = ["discrete-gpu", "apple-silicon", "cpu-only"];
const DISCRETE_GPU_ONLY: HardwareKind[] = ["discrete-gpu"];
```

Give `ollama`, `llamacpp` and `koboldcpp` `runsOn: ANY_HARDWARE`; give `vllm`, `tgi` and `sglang` `runsOn: DISCRETE_GPU_ONLY`.

- [ ] **Step 5: Add the guard to `evaluate()`**

In `src/lib/compat/evaluate.ts`, immediately after `const engine = getEngine(settings.engine);` and **before** the quant selection:

```ts
  // Guard: hardware. A model that fits perfectly is still unrunnable if the
  // engine has no backend for this machine.
  if (!engine.runsOn.includes(hw.kind)) {
    return wontRun("engine", `${engine.label} does not run on ${HARDWARE_LABELS[hw.kind]}.`);
  }
```

Add the label table at module scope, beneath the other constants:

```ts
const HARDWARE_LABELS: Record<HardwareKind, string> = {
  "discrete-gpu": "a discrete GPU",
  "apple-silicon": "Apple Silicon",
  "cpu-only": "a CPU-only machine",
};
```

Import `HardwareKind` in the type import list.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/compat/__tests__/`
Expected: PASS, including the three golden anchors unchanged.

- [ ] **Step 7: Run the whole suite and the build**

Run: `npm test && npm run build`
Expected: all PASS. The purity test must still pass — `HARDWARE_LABELS` is a plain object, no forbidden tokens.

- [ ] **Step 8: Commit**

```bash
git add src/lib/compat/
git commit -m "feat: model engine/hardware compatibility in the engine table"
```

---

### Task 2: Compute the breakdown before the context guard

**Files:**
- Modify: `src/lib/compat/evaluate.ts`
- Test: `src/lib/compat/__tests__/evaluate.test.ts`

**Interfaces:**
- Consumes: Task 1's guard ordering
- Produces: a `wont-run` / `"context"` verdict whose `breakdown` holds real numbers

The spec sells the breakdown with *"your VRAM is fine, your context length is not" beats a red X* — but that is exactly the case where all four breakdown fields are currently `0`, so the report has nothing to draw. Compute the memory at the **requested** context, then disqualify. The enormous KV figure is the point: it shows the user *why*.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/compat/__tests__/evaluate.test.ts
describe("evaluate — a too-long context still shows its arithmetic", () => {
  const v = evaluate(llama8b, rtx4070, { ...ollama8k, contextLength: 200_000 });

  it("still refuses, naming the context", () => {
    expect(v.status).toBe("wont-run");
    expect(v.limitingFactor).toBe("context");
  });

  it("reports the weights it would have needed", () => {
    expect(v.breakdown.weightsBytes).toBe(4_920_734_208);
    expect(v.quantId).toBe("Q4_K_M");
  });

  it("reports the KV cache at the REQUESTED context, which is the whole point", () => {
    // 2 * 32 * 8 * 128 * 200000 * 2
    expect(v.breakdown.kvCacheBytes).toBe(26_214_400_000);
    expect(v.breakdown.totalBytes).toBeGreaterThan(v.breakdown.kvCacheBytes);
  });

  it("leaves the nonsense-context guard returning an empty breakdown", () => {
    // -1 tokens has no meaningful arithmetic to show.
    const bad = evaluate(llama8b, rtx4070, { ...ollama8k, contextLength: -1 });
    expect(bad.breakdown.totalBytes).toBe(0);
    expect(bad.limitingFactor).toBe("context");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/compat/__tests__/evaluate.test.ts`
Expected: FAIL — `weightsBytes` is `0`, because the guard returns before any arithmetic.

- [ ] **Step 3: Move the too-long guard below the breakdown**

In `src/lib/compat/evaluate.ts`, delete the existing "Guard 1: context length" block (the one comparing against `model.arch.maxContext` — keep Guard 0, the positive-integer check, exactly where it is). Then, immediately after `const base = { breakdown, confidence: quant.sizeSource, quantId: quant.id };`, insert:

```ts
  // Context is checked here rather than earlier so the verdict carries real
  // numbers. "Your VRAM is fine, your context length is not" is only useful
  // if the report can show the KV cache that context would cost.
  if (settings.contextLength > model.arch.maxContext) {
    return {
      ...base,
      status: "wont-run",
      limitingFactor: "context",
      notes: [`This model supports up to ${groupDigits(model.arch.maxContext)} tokens.`],
    };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/compat/__tests__/evaluate.test.ts`
Expected: PASS. Confirm the golden anchors are untouched — they use 8192 context, well inside the maximum, so this reordering cannot reach them.

- [ ] **Step 5: Run the whole suite and the build**

Run: `npm test && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compat/evaluate.ts src/lib/compat/__tests__/evaluate.test.ts
git commit -m "feat: keep the memory breakdown on a too-long-context verdict"
```

---

### Task 3: Data loading and display formatting

**Files:**
- Create: `src/lib/data/load.ts`, `src/lib/ui/format.ts`
- Modify: `src/lib/data/schema.ts`, `tsconfig.json`
- Test: `src/lib/data/__tests__/load.test.ts`, `src/lib/ui/__tests__/format.test.ts`

**Interfaces:**
- Consumes: `modelsFileSchema`, `gpusFileSchema`, `laptopsFileSchema`
- Produces: `loadModels(): ModelSpec[]`, `loadGpus(): GpuEntry[]`, `loadLaptops(): LaptopEntry[]`, types `GpuEntry` / `LaptopEntry`; and `formatGB(bytes): string`, `formatPercent(part, whole): string`, `formatTokens(n): string`

- [ ] **Step 1: Enable JSON imports**

In `tsconfig.json`, add to `compilerOptions`:

```json
    "resolveJsonModule": true,
```

- [ ] **Step 2: Export the row schemas for type inference**

In `src/lib/data/schema.ts`, the GPU and laptop row objects are currently inline inside their file schemas. Lift each to a named export and reference it, so types can be inferred from one place:

```ts
export const gpuSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  vendor: z.enum(["nvidia", "amd", "intel", "apple"]),
  vramBytes: z.number().nonnegative(),
  memBandwidthGBs: positive.optional(),
});

export const laptopSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["discrete-gpu", "apple-silicon", "cpu-only"]),
  gpuId: z.string().nullable(),
  vramBytes: z.number().nonnegative(),
  ramBytes: positive,
  ramType: z.enum(["DDR4", "DDR5", "LPDDR4X", "LPDDR5", "LPDDR5X", "unified"]),
});
```

Then `gpusFileSchema` becomes `z.object({ schemaVersion: z.literal(SCHEMA_VERSION), gpus: z.array(gpuSchema) })` and `laptopsFileSchema` likewise with `laptops: z.array(laptopSchema)`. Behaviour is unchanged; the existing schema tests must still pass.

- [ ] **Step 3: Write the failing tests**

```ts
// src/lib/data/__tests__/load.test.ts
import { describe, expect, it } from "vitest";
import { loadGpus, loadLaptops, loadModels } from "../load";

describe("data loading", () => {
  it("loads the shipped models", () => {
    const models = loadModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.map((m) => m.id)).toContain("meta-llama/Llama-3.1-8B-Instruct");
  });

  it("loads GPUs including Apple parts with no discrete VRAM", () => {
    const gpus = loadGpus();
    expect(gpus.find((g) => g.id === "apple-m3-max")?.vramBytes).toBe(0);
  });

  it("loads laptops whose gpuId all resolve or are null", () => {
    const ids = new Set(loadGpus().map((g) => g.id));
    for (const l of loadLaptops()) {
      if (l.gpuId !== null) expect(ids.has(l.gpuId)).toBe(true);
    }
  });

  it("returns the same array identity on repeated calls", () => {
    expect(loadModels()).toBe(loadModels());
  });
});
```

```ts
// src/lib/ui/__tests__/format.test.ts
import { describe, expect, it } from "vitest";
import { formatGB, formatPercent, formatTokens } from "../format";

describe("formatGB", () => {
  it("renders two decimals with a unit", () => {
    expect(formatGB(4_920_734_208)).toBe("4.92 GB");
  });
  it("uses MB below a gigabyte so small numbers stay readable", () => {
    expect(formatGB(597_456_000)).toBe("597 MB");
  });
  it("renders zero without a negative sign", () => {
    expect(formatGB(0)).toBe("0 MB");
  });
});

describe("formatPercent", () => {
  it("rounds to a whole percent", () => {
    expect(formatPercent(6_591_932_032, 12_000_000_000)).toBe("55%");
  });
  it("reports over 100% rather than clamping — overflow is the useful signal", () => {
    expect(formatPercent(24_000_000_000, 12_000_000_000)).toBe("200%");
  });
  it("returns a dash when the denominator is zero", () => {
    expect(formatPercent(1, 0)).toBe("—");
  });
});

describe("formatTokens", () => {
  it("groups digits deterministically", () => {
    expect(formatTokens(131_072)).toBe("131,072");
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/__tests__/load.test.ts src/lib/ui/__tests__/format.test.ts`
Expected: FAIL — neither module exists.

- [ ] **Step 5: Write `src/lib/data/load.ts`**

```ts
import modelsJson from "../../../data/models.json";
import gpusJson from "../../../data/gpus.json";
import laptopsJson from "../../../data/laptops.json";
import type { ModelSpec } from "../compat/types";
import { gpuSchema, gpusFileSchema, laptopSchema, laptopsFileSchema, modelsFileSchema } from "./schema";
import type { z } from "zod";

export type GpuEntry = z.infer<typeof gpuSchema>;
export type LaptopEntry = z.infer<typeof laptopSchema>;

/**
 * Parsed once at module load. A schema mismatch throws here rather than
 * letting a renamed field read as undefined and render 0 GB — the data is
 * regenerated by a scheduled job, so failing loudly is the whole point.
 */
function parse<T>(schema: { parse(v: unknown): T }, raw: unknown, what: string): T {
  try {
    return schema.parse(raw);
  } catch (cause) {
    throw new Error(`data/${what}.json does not match its schema`, { cause });
  }
}

const models = parse(modelsFileSchema, modelsJson, "models").models as ModelSpec[];
const gpus = parse(gpusFileSchema, gpusJson, "gpus").gpus;
const laptops = parse(laptopsFileSchema, laptopsJson, "laptops").laptops;

export function loadModels(): ModelSpec[] {
  return models;
}
export function loadGpus(): GpuEntry[] {
  return gpus;
}
export function loadLaptops(): LaptopEntry[] {
  return laptops;
}
```

- [ ] **Step 6: Write `src/lib/ui/format.ts`**

```ts
const BYTES_PER_GB = 1_000_000_000;
const BYTES_PER_MB = 1_000_000;

/** Decimal units, matching how VRAM and GGUF file sizes are quoted. */
export function formatGB(bytes: number): string {
  if (bytes < BYTES_PER_GB) return `${Math.round(bytes / BYTES_PER_MB)} MB`;
  return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`;
}

/** Deliberately uncapped: "200%" tells the user how far over they are. */
export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export function formatTokens(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/__tests__/load.test.ts src/lib/ui/__tests__/format.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the whole suite and the build**

Run: `npm test && npm run build`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add tsconfig.json src/lib/data/ src/lib/ui/
git commit -m "feat: add validated data loading and display formatting"
```

---

### Task 4: Design tokens and UI primitives

**Files:**
- Create: `src/styles/tokens.css`, `src/components/ui/Button.tsx`, `Pill.tsx`, `Badge.tsx`, `HelpDot.tsx`, `Field.tsx`, `Segmented.tsx`, `Chip.tsx`
- Modify: `package.json`, `vite.config.ts`, `src/main.tsx`
- Test: `src/components/ui/__tests__/primitives.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `<Button variant="primary"|"secondary">`, `<VerdictPill status={VerdictStatus} />`, `<Badge source="measured"|"estimated" />`, `<HelpDot label={string} />`, `<Field label htmlFor help?>`, `<Segmented options value onChange>`, `<Chip pressed onClick>`

Open [`docs/design/style-reference.html`](../../design/style-reference.html) first — it renders every one of these. Copy the token values from its `:root` block exactly.

- [ ] **Step 1: Add the testing dependencies**

```bash
npm install -D jsdom@25.0.1 @testing-library/react@16.0.1 @testing-library/jest-dom@6.6.3 @testing-library/user-event@14.5.2
```

- [ ] **Step 2: Switch the test environment to jsdom**

In `vite.config.ts`, change the `test` block to:

```ts
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
```

Create `src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

The existing `src/lib/compat` and `src/lib/data` tests use `node:fs`, which still works under jsdom — that environment changes the globals, not the runtime.

- [ ] **Step 3: Write `src/styles/tokens.css`**

```css
:root {
  --ground: #55547e;
  --ground-deep: #43426a;
  --card: #fcf9ec;
  --card-sunk: #f1eddc;
  --ink: #141046;
  --ink-soft: #55507f;

  --accent-a: #7c3aed;
  --accent-b: #2f6fed;
  --accent-c: #2dd4bf;
  --accent-grad: linear-gradient(103deg, var(--accent-a) 0%, var(--accent-b) 58%, var(--accent-c) 100%);

  --run: #2fb673;
  --offload: #f0a429;
  --wont: #e25548;

  --bw: 3px;
  --r: 14px;
  --r-sm: 9px;
  --shadow: 6px 6px 0 var(--ink);
  --shadow-sm: 4px 4px 0 var(--ink);

  --f-display: "Archivo Black", "Arial Black", system-ui, sans-serif;
  --f-body: "IBM Plex Sans", system-ui, -apple-system, sans-serif;
  --f-mono: "IBM Plex Mono", ui-monospace, Consolas, monospace;
}

/* A deliberate single-theme design: this indigo world is the product identity,
   so every colour is painted explicitly rather than inherited from the host. */
body {
  margin: 0;
  background: var(--ground);
  color: var(--card);
  font-family: var(--f-body);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.label {
  font-family: var(--f-mono);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.panel {
  background: var(--card);
  color: var(--ink);
  border: var(--bw) solid var(--ink);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  padding: 22px;
}

:focus-visible {
  outline: 3px solid var(--accent-c);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

Add the font link to `index.html`'s `<head>`:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600;700&display=swap" />
```

Import the stylesheet at the top of `src/main.tsx`: `import "./styles/tokens.css";`

- [ ] **Step 4: Write the failing test**

```tsx
// src/components/ui/__tests__/primitives.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "../Badge";
import { Chip } from "../Chip";
import { Segmented } from "../Segmented";
import { VerdictPill } from "../Pill";

describe("VerdictPill", () => {
  it.each([
    ["run-on-gpu", "Run on GPU"],
    ["cpu-offloaded", "CPU offloaded"],
    ["wont-run", "Won't run"],
  ] as const)("labels %s in words, not colour alone", (status, text) => {
    render(<VerdictPill status={status} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("carries a non-colour glyph so it survives greyscale", () => {
    render(<VerdictPill status="run-on-gpu" />);
    expect(screen.getByTestId("verdict-glyph")).not.toBeEmptyDOMElement();
  });
});

describe("Badge", () => {
  it("says whether a size was measured or estimated", () => {
    render(<Badge source="estimated" />);
    expect(screen.getByText("Estimated")).toBeInTheDocument();
  });
});

describe("Segmented", () => {
  it("marks the selected option pressed and reports changes", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="KV cache precision"
        options={[
          { value: "fp16", label: "fp16" },
          { value: "q8", label: "q8" },
        ]}
        value="fp16"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "fp16" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "q8" }));
    expect(onChange).toHaveBeenCalledWith("q8");
  });
});

describe("Chip", () => {
  it("exposes its pressed state to assistive tech", () => {
    render(<Chip pressed onClick={() => {}}>Code</Chip>);
    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "true");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run src/components/ui/__tests__/primitives.test.tsx`
Expected: FAIL — none of the components exist.

- [ ] **Step 6: Write the primitives**

`src/components/ui/Pill.tsx` — the accessibility-critical one. Status reads three ways: glyph, word, colour.

```tsx
import type { VerdictStatus } from "../../lib/compat";

const PRESENTATION: Record<VerdictStatus, { text: string; glyph: string; tone: string }> = {
  "run-on-gpu": { text: "Run on GPU", glyph: "●", tone: "var(--run)" },
  "cpu-offloaded": { text: "CPU offloaded", glyph: "▲", tone: "var(--offload)" },
  "wont-run": { text: "Won't run", glyph: "✗", tone: "var(--wont)" },
};

export function VerdictPill({ status }: { status: VerdictStatus }) {
  const { text, glyph, tone } = PRESENTATION[status];
  return (
    <span className="pill" style={{ background: tone }}>
      <span data-testid="verdict-glyph" aria-hidden="true">{glyph}</span>
      {text}
    </span>
  );
}
```

`src/components/ui/Badge.tsx`:

```tsx
export function Badge({ source }: { source: "measured" | "estimated" }) {
  const measured = source === "measured";
  return (
    <span
      className={`badge ${source}`}
      title={
        measured
          ? "Size read from a published file"
          : "Size computed from parameters × bits-per-weight"
      }
    >
      {measured ? "Measured" : "Estimated"}
    </span>
  );
}
```

`src/components/ui/Segmented.tsx`:

```tsx
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`src/components/ui/Chip.tsx`:

```tsx
import type { ReactNode } from "react";

export function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="chip-btn" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}
```

`src/components/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "secondary",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  children: ReactNode;
}) {
  return (
    <button type="button" className={`btn btn-${variant}`} {...rest}>
      {children}
    </button>
  );
}
```

`src/components/ui/HelpDot.tsx`:

```tsx
export function HelpDot({ label }: { label: string }) {
  return (
    <span className="help" role="img" aria-label={label} title={label}>
      ?
    </span>
  );
}
```

`src/components/ui/Field.tsx`:

```tsx
import type { ReactNode } from "react";
import { HelpDot } from "./HelpDot";

export function Field({
  label,
  htmlFor,
  help,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="label lab" htmlFor={htmlFor}>
        {label}
        {help ? <HelpDot label={help} /> : null}
      </label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
```

- [ ] **Step 7: Add the component styles**

Append to `src/styles/tokens.css` the `.pill`, `.badge`, `.btn`, `.seg`, `.chip-btn`, `.field`, `.hint` and `.help` rules. Copy them verbatim from the corresponding blocks in `docs/design/style-reference.html` — the pressed-state transform is `transform: translate(4px, 4px); box-shadow: 0 0 0 var(--ink);` on `:active`, and the transition is `transform .07s steps(2), box-shadow .07s steps(2)`. It must click, not glide.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/components/ui/__tests__/primitives.test.tsx`
Expected: PASS.

- [ ] **Step 9: Run the whole suite and the build**

Run: `npm test && npm run build`
Expected: all PASS. The compat and data tests must still pass under jsdom.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vite.config.ts index.html src/test-setup.ts src/styles/ src/components/ src/main.tsx
git commit -m "feat: add pixel design tokens and UI primitives"
```

---

### Task 5: Hardware form state

**Files:**
- Create: `src/hooks/useHardwareForm.ts`
- Test: `src/hooks/__tests__/useHardwareForm.test.ts`

**Interfaces:**
- Consumes: `HardwareSpec`, `Settings` from `src/lib/compat`; `GpuEntry`, `LaptopEntry` from `src/lib/data/load`
- Produces: `useHardwareForm()` returning `{ hw, settings, setHw, setSettings, applyGpu, applyLaptop, appliedLaptopId }`

This hook is where the spec's manual-override rule lives: **a lookup writes into form state and then has no further authority.** There is no locked state, so overriding a prefilled value is just typing. The test below is the one that proves it.

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/__tests__/useHardwareForm.test.ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GB } from "../../lib/compat";
import { useHardwareForm } from "../useHardwareForm";

const rtx4090 = { id: "rtx-4090", name: "RTX 4090", vendor: "nvidia" as const, vramBytes: 24 * GB };
const macbook = {
  id: "macbook-pro-16-m3-max-64",
  name: 'MacBook Pro 16" M3 Max (64GB)',
  kind: "apple-silicon" as const,
  gpuId: "apple-m3-max",
  vramBytes: 0,
  ramBytes: 64 * GB,
  ramType: "unified" as const,
};

describe("useHardwareForm", () => {
  it("starts from a sensible default", () => {
    const { result } = renderHook(() => useHardwareForm());
    expect(result.current.hw.kind).toBe("discrete-gpu");
    expect(result.current.settings.engine).toBe("ollama");
  });

  it("prefills VRAM from a GPU lookup", () => {
    const { result } = renderHook(() => useHardwareForm());
    act(() => result.current.applyGpu(rtx4090));
    expect(result.current.hw.vramBytes).toBe(24 * GB);
  });

  it("prefills every field from a laptop lookup", () => {
    const { result } = renderHook(() => useHardwareForm());
    act(() => result.current.applyLaptop(macbook));
    expect(result.current.hw.kind).toBe("apple-silicon");
    expect(result.current.hw.ramBytes).toBe(64 * GB);
    expect(result.current.hw.ramType).toBe("unified");
  });

  it("KEEPS a manual override after a laptop prefill — form state is the truth", () => {
    const { result } = renderHook(() => useHardwareForm());
    act(() => result.current.applyLaptop(macbook));
    act(() => result.current.setHw({ ramBytes: 96 * GB }));
    expect(result.current.hw.ramBytes).toBe(96 * GB);
    // and nothing re-applies the preset behind the user's back
    expect(result.current.hw.kind).toBe("apple-silicon");
  });

  it("clamps context to the model maximum only when asked, never silently", () => {
    const { result } = renderHook(() => useHardwareForm());
    act(() => result.current.setSettings({ contextLength: 200_000 }));
    expect(result.current.settings.contextLength).toBe(200_000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useHardwareForm.test.ts`
Expected: FAIL — `Cannot find module '../useHardwareForm'`.

- [ ] **Step 3: Write the hook**

```ts
import { useCallback, useState } from "react";
import { GB, type HardwareSpec, type Settings } from "../lib/compat";
import type { GpuEntry, LaptopEntry } from "../lib/data/load";

const DEFAULT_HW: HardwareSpec = {
  kind: "discrete-gpu",
  vramBytes: 12 * GB,
  ramBytes: 32 * GB,
  ramType: "DDR5",
};

const DEFAULT_SETTINGS: Settings = {
  engine: "ollama",
  contextLength: 8192,
  kvPrecision: "fp16",
  quantId: "auto",
};

export function useHardwareForm() {
  const [hw, setHwState] = useState<HardwareSpec>(DEFAULT_HW);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [appliedLaptopId, setAppliedLaptopId] = useState<string | null>(null);

  // Patches, not replacements: a lookup prefills these same fields, so both
  // paths write to one place and the last write wins. That is what makes a
  // prefilled value overridable without any "unlock" step.
  const setHw = useCallback((patch: Partial<HardwareSpec>) => {
    setHwState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyGpu = useCallback((gpu: GpuEntry) => {
    setHwState((prev) => ({
      ...prev,
      kind: gpu.vendor === "apple" ? "apple-silicon" : "discrete-gpu",
      vramBytes: gpu.vramBytes,
      memBandwidthGBs: gpu.memBandwidthGBs,
    }));
  }, []);

  const applyLaptop = useCallback((laptop: LaptopEntry) => {
    setAppliedLaptopId(laptop.id);
    setHwState((prev) => ({
      ...prev,
      kind: laptop.kind,
      vramBytes: laptop.vramBytes,
      ramBytes: laptop.ramBytes,
      ramType: laptop.ramType,
    }));
  }, []);

  return { hw, settings, setHw, setSettings, applyGpu, applyLaptop, appliedLaptopId };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useHardwareForm.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/
git commit -m "feat: add hardware form state where the form is the source of truth"
```

---

### Task 6: The hardware panel

**Files:**
- Create: `src/features/hardware/HardwarePanel.tsx`, `src/features/hardware/DeviceLookup.tsx`
- Test: `src/features/hardware/__tests__/HardwarePanel.test.tsx`

**Interfaces:**
- Consumes: `useHardwareForm()` (T5), `Field`/`Segmented`/`Button` (T4), `loadGpus`/`loadLaptops` (T3), `ENGINES` from `src/lib/compat`
- Produces: `<HardwarePanel form={ReturnType<typeof useHardwareForm>} />`, `<DeviceLookup onPickGpu onPickLaptop />`, `quantOptionsFor(models, engineId): string[]`

Spec §6 lists quantisation as an input, and the carry-forward note makes it load-bearing:
**the quant control must filter by `engine.formats`.** `selectQuant` returns `null` both when
the engine supports none of a model's formats and when it supports the format but not the
chosen id — and the resulting note says "cannot load any quantisation of this model", which
is false in the second case. If the dropdown only ever offers ids the engine can load, a user
cannot reach that message.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/hardware/__tests__/HardwarePanel.test.tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HardwarePanel } from "../HardwarePanel";
import { useHardwareForm } from "../../../hooks/useHardwareForm";

function Harness() {
  const form = useHardwareForm();
  return (
    <>
      <HardwarePanel form={form} />
      <output data-testid="vram">{form.hw.vramBytes}</output>
      <output data-testid="engine">{form.settings.engine}</output>
      <output data-testid="quant">{form.settings.quantId}</output>
    </>
  );
}

describe("HardwarePanel", () => {
  it("offers every engine the compat module knows about", () => {
    render(<Harness />);
    const select = screen.getByLabelText(/inference engine/i);
    expect(select).toHaveDisplayValue("Ollama");
    expect(screen.getByRole("option", { name: "vLLM" })).toBeInTheDocument();
  });

  it("writes a manual VRAM edit straight into form state", async () => {
    render(<Harness />);
    const vram = screen.getByLabelText(/vram/i);
    await userEvent.clear(vram);
    await userEvent.type(vram, "24");
    expect(screen.getByTestId("vram")).toHaveTextContent("24000000000");
  });

  it("changes the engine", async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText(/inference engine/i), "vllm");
    expect(screen.getByTestId("engine")).toHaveTextContent("vllm");
  });

  it("offers only quantisations the selected engine can actually load", async () => {
    render(<Harness />);
    const quant = screen.getByLabelText(/quantisation/i);
    // Ollama is GGUF-only, so it must offer Q4_K_M and never the AWQ build.
    expect(within(quant).getByRole("option", { name: "Q4_K_M" })).toBeInTheDocument();
    expect(within(quant).queryByRole("option", { name: "AWQ-4bit" })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/inference engine/i), "vllm");
    // vLLM cannot load GGUF, so the offer must invert.
    expect(within(quant).queryByRole("option", { name: "Q4_K_M" })).not.toBeInTheDocument();
    expect(within(quant).getByRole("option", { name: "AWQ-4bit" })).toBeInTheDocument();
  });

  it("falls back to Auto when the chosen quant is not loadable by the new engine", async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText(/quantisation/i), "Q4_K_M");
    await userEvent.selectOptions(screen.getByLabelText(/inference engine/i), "vllm");
    expect(screen.getByTestId("quant")).toHaveTextContent("auto");
  });

  it("prefills from a laptop and still lets the user override RAM afterwards", async () => {
    render(<Harness />);
    await userEvent.selectOptions(
      screen.getByLabelText(/laptop/i),
      "macbook-pro-16-m3-max-64",
    );
    const ram = screen.getByLabelText(/system ram/i);
    expect(ram).toHaveValue(64);
    await userEvent.clear(ram);
    await userEvent.type(ram, "96");
    expect(ram).toHaveValue(96);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/hardware/__tests__/HardwarePanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/features/hardware/DeviceLookup.tsx`**

```tsx
import { loadGpus, loadLaptops, type GpuEntry, type LaptopEntry } from "../../lib/data/load";
import { Field } from "../../components/ui/Field";

export function DeviceLookup({
  onPickGpu,
  onPickLaptop,
}: {
  onPickGpu: (gpu: GpuEntry) => void;
  onPickLaptop: (laptop: LaptopEntry) => void;
}) {
  const gpus = loadGpus();
  const laptops = loadLaptops();

  return (
    <>
      <Field
        label="Graphics card"
        htmlFor="gpu-lookup"
        help="Pick your card to fill in its VRAM. Not listed? Type the VRAM yourself."
        hint="Auto-fills VRAM — always editable."
      >
        <select
          id="gpu-lookup"
          className="select"
          defaultValue=""
          onChange={(e) => {
            const gpu = gpus.find((g) => g.id === e.target.value);
            if (gpu) onPickGpu(gpu);
          }}
        >
          <option value="">Select a graphics card…</option>
          {gpus.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Laptop"
        htmlFor="laptop-lookup"
        help="Pick your laptop to fill in GPU, VRAM, RAM and RAM type at once."
        hint="Everything it fills stays editable."
      >
        <select
          id="laptop-lookup"
          className="select"
          defaultValue=""
          onChange={(e) => {
            const laptop = laptops.find((l) => l.id === e.target.value);
            if (laptop) onPickLaptop(laptop);
          }}
        >
          <option value="">Select a laptop…</option>
          {laptops.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
```

- [ ] **Step 4: Write `src/features/hardware/HardwarePanel.tsx`**

```tsx
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
        help="Decides which quantisations are offered and whether the model can spill into system RAM."
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
        help="Smaller quantisations shrink the weights at some cost to quality. Only formats your engine can load are offered."
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
        help="How much text the model keeps in mind. Longer contexts cost VRAM."
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
        help="Every token is remembered in a cache that lives in VRAM. Dropping fp16 to q8 halves it."
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/features/hardware/__tests__/HardwarePanel.test.tsx`
Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/hardware/
git commit -m "feat: add the hardware panel with lookup and engine-aware quant control"
```

---

### Task 7: Results — stat tiles and the model list

**Files:**
- Create: `src/features/results/useVerdicts.ts`, `StatTiles.tsx`, `ModelCard.tsx`, `ModelList.tsx`
- Test: `src/features/results/__tests__/results.test.tsx`

**Interfaces:**
- Consumes: `evaluate`, `usableVram` from `src/lib/compat`; `loadModels` (T3); `formatGB`/`formatPercent` (T3); `VerdictPill`/`Badge` (T4)
- Produces: `useVerdicts(hw, settings): ScoredModel[]` where `ScoredModel = { model: ModelSpec; verdict: Verdict }`; `TIGHT_FIT_FRACTION`, `isTightFit(verdict, vramBytes): boolean`; `<StatTiles rows />`, `<ModelList rows vramBytes />`, `<ModelCard row vramBytes />`

`llmrun.dev` shows each row's VRAM need *and* what percentage of the card it consumes. That percentage is what makes a near-miss legible, so it goes on the card. `canirun.ai` goes further and calls out a "tight fit" — this task adds that as a derived flag, plus a genuine empty state for a machine where nothing fits.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/results/__tests__/results.test.tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { GB, type HardwareSpec, type Settings } from "../../../lib/compat";
import { loadModels } from "../../../lib/data/load";
import { isTightFit, scoreModels } from "../useVerdicts";
import { ModelList } from "../ModelList";
import { StatTiles } from "../StatTiles";

const hw: HardwareSpec = { kind: "discrete-gpu", vramBytes: 12 * GB, ramBytes: 64 * GB };
const settings: Settings = {
  engine: "ollama",
  contextLength: 8192,
  kvPrecision: "fp16",
  quantId: "auto",
};
const rows = () => scoreModels(loadModels(), hw, settings);

describe("scoreModels", () => {
  it("scores every model exactly once", () => {
    expect(rows()).toHaveLength(loadModels().length);
  });

  it("reproduces the engine's verdicts on the reference machine", () => {
    const byId = new Map(rows().map((r) => [r.model.id, r.verdict.status]));
    expect(byId.get("meta-llama/Llama-3.1-8B-Instruct")).toBe("run-on-gpu");
    expect(byId.get("meta-llama/Llama-3.3-70B-Instruct")).toBe("cpu-offloaded");
    expect(byId.get("Qwen/Qwen3-235B-A22B")).toBe("wont-run");
  });
});

describe("StatTiles", () => {
  it("counts each bucket", () => {
    render(<StatTiles rows={rows()} />);
    expect(within(screen.getByTestId("tile-run-on-gpu")).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByTestId("tile-cpu-offloaded")).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByTestId("tile-wont-run")).getByText("1")).toBeInTheDocument();
  });
});

describe("ModelList", () => {
  it("shows the memory need and what share of the card it takes", () => {
    render(
      <MemoryRouter>
        <ModelList rows={rows()} vramBytes={12 * GB} />
      </MemoryRouter>,
    );
    const card = screen.getByTestId("card-meta-llama/Llama-3.1-8B-Instruct");
    expect(within(card).getByText("6.59 GB")).toBeInTheDocument();
    expect(within(card).getByText("55%")).toBeInTheDocument();
  });

  it("labels each verdict in words as well as colour", () => {
    render(
      <MemoryRouter>
        <ModelList rows={rows()} vramBytes={12 * GB} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Run on GPU")).toBeInTheDocument();
    expect(screen.getByText("Won't run")).toBeInTheDocument();
  });

  it("names the creator and the context window, the two fields a scanner uses", () => {
    render(
      <MemoryRouter>
        <ModelList rows={rows()} vramBytes={12 * GB} />
      </MemoryRouter>,
    );
    const card = screen.getByTestId("card-meta-llama/Llama-3.1-8B-Instruct");
    expect(within(card).getByText("meta-llama")).toBeInTheDocument();
    expect(within(card).getByText(/131,072 ctx/)).toBeInTheDocument();
  });

  it("tells the user when a machine can run nothing, instead of showing a blank list", () => {
    const tiny: HardwareSpec = { kind: "discrete-gpu", vramBytes: 2 * GB, ramBytes: 4 * GB };
    render(
      <MemoryRouter>
        <ModelList rows={scoreModels(loadModels(), tiny, settings)} vramBytes={2 * GB} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/nothing here fits/i)).toBeInTheDocument();
  });
});

describe("isTightFit", () => {
  it("flags a model that fits but leaves almost no headroom", () => {
    // 6.59 GB of a 7 GB card is 94% — it "runs", until anything else touches the GPU.
    const [eightB] = scoreModels(
      loadModels().filter((m) => m.id === "meta-llama/Llama-3.1-8B-Instruct"),
      { kind: "discrete-gpu", vramBytes: 7 * GB, ramBytes: 64 * GB },
      settings,
    );
    expect(eightB!.verdict.status).toBe("run-on-gpu");
    expect(isTightFit(eightB!.verdict, 7 * GB)).toBe(true);
  });

  it("does not flag a comfortable fit", () => {
    const [eightB] = rows().filter((r) => r.model.id === "meta-llama/Llama-3.1-8B-Instruct");
    expect(isTightFit(eightB!.verdict, 12 * GB)).toBe(false);
  });

  it("never flags a model that does not run on the GPU at all", () => {
    const [big] = rows().filter((r) => r.model.id === "Qwen/Qwen3-235B-A22B");
    expect(isTightFit(big!.verdict, 12 * GB)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/results/__tests__/results.test.tsx`
Expected: FAIL — modules not found. (`react-router-dom` is installed in Task 9; install it now with `npm install react-router-dom@6.28.0` so this test can import `MemoryRouter`.)

- [ ] **Step 3: Write `src/features/results/useVerdicts.ts`**

```ts
import { useMemo } from "react";
import { evaluate, type HardwareSpec, type ModelSpec, type Settings, type Verdict } from "../../lib/compat";

export interface ScoredModel {
  model: ModelSpec;
  verdict: Verdict;
}

/** Pure, so tests can call it without rendering. */
export function scoreModels(
  models: ModelSpec[],
  hw: HardwareSpec,
  settings: Settings,
): ScoredModel[] {
  return models.map((model) => ({ model, verdict: evaluate(model, hw, settings) }));
}

/**
 * Re-scores on every input change. A few hundred models of arithmetic is well
 * under a frame, so there is no submit button — but memoising keeps React from
 * redoing it for unrelated re-renders.
 */
export function useVerdicts(
  models: ModelSpec[],
  hw: HardwareSpec,
  settings: Settings,
): ScoredModel[] {
  return useMemo(() => scoreModels(models, hw, settings), [models, hw, settings]);
}

/**
 * Above this share of VRAM a model still "runs", but with so little headroom
 * that a desktop compositor or a second application will push it into an OOM.
 * Presentation only: the engine's three buckets are unchanged, and this reads
 * the total evaluate() already computed rather than re-deriving anything.
 */
export const TIGHT_FIT_FRACTION = 0.9;

export function isTightFit(verdict: Verdict, vramBytes: number): boolean {
  if (verdict.status !== "run-on-gpu" || vramBytes <= 0) return false;
  return verdict.breakdown.totalBytes > vramBytes * TIGHT_FIT_FRACTION;
}
```

- [ ] **Step 4: Write `src/features/results/StatTiles.tsx`**

```tsx
import type { VerdictStatus } from "../../lib/compat";
import type { ScoredModel } from "./useVerdicts";

const TILES: { status: VerdictStatus; label: string; tone: string }[] = [
  { status: "run-on-gpu", label: "Run on GPU", tone: "var(--run)" },
  { status: "cpu-offloaded", label: "CPU offloaded", tone: "var(--offload)" },
  { status: "wont-run", label: "Won't run", tone: "var(--wont)" },
];

export function StatTiles({ rows }: { rows: ScoredModel[] }) {
  return (
    <div className="tiles">
      {TILES.map(({ status, label, tone }) => (
        <div
          key={status}
          className="tile"
          data-testid={`tile-${status}`}
          style={{ ["--tone" as string]: tone }}
        >
          <span className="n">{rows.filter((r) => r.verdict.status === status).length}</span>
          <span className="label">{label}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Write `src/features/results/ModelCard.tsx`**

```tsx
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { VerdictPill } from "../../components/ui/Pill";
import { formatGB, formatPercent, formatTokens } from "../../lib/ui/format";
import { isTightFit, type ScoredModel } from "./useVerdicts";

export function ModelCard({ row, vramBytes }: { row: ScoredModel; vramBytes: number }) {
  const { model, verdict } = row;
  const moe = model.params.active !== null;

  return (
    <article className="verdict card" data-testid={`card-${model.id}`}>
      <div className="v-top">
        <Link className="v-name" to={`/model/${encodeURIComponent(model.id)}`}>
          {model.displayName}
        </Link>
        <span className="v-arch">
          {moe
            ? `${(model.params.total / 1e9).toFixed(0)}B total / ${(model.params.active! / 1e9).toFixed(0)}B active · MoE`
            : `${(model.params.total / 1e9).toFixed(1)}B dense`}{" "}
          · {model.arch.numLayers}L · {model.arch.numKvHeads} KV heads
        </span>
        <span className="v-spacer" />
        {isTightFit(verdict, vramBytes) ? (
          <span className="badge tight" title="Fits, but with almost no headroom left">
            Tight fit
          </span>
        ) : null}
        <Badge source={verdict.confidence} />
        <VerdictPill status={verdict.status} />
      </div>
      <div className="v-body">
        <div className="bar-head">
          <span>
            {model.source.hfRepo.split("/")[0]} · {verdict.quantId ?? "—"} ·{" "}
            {formatTokens(model.arch.maxContext)} ctx
          </span>
          <span>
            {formatGB(verdict.breakdown.totalBytes)}
            {" · "}
            {formatPercent(verdict.breakdown.totalBytes, vramBytes)}
          </span>
        </div>
        {verdict.notes[0] ? (
          <p className="why">
            <b>Why</b> <span>{verdict.notes[0]}</span>
          </p>
        ) : null}
      </div>
    </article>
  );
}
```

- [ ] **Step 6: Write `src/features/results/ModelList.tsx`**

```tsx
import { ModelCard } from "./ModelCard";
import type { ScoredModel } from "./useVerdicts";

export function ModelList({ rows, vramBytes }: { rows: ScoredModel[]; vramBytes: number }) {
  if (rows.length === 0) {
    return <p className="empty">No models match these filters.</p>;
  }

  // A list where every row says "Won't run" reads as a broken page. Say it once,
  // plainly, and point somewhere useful.
  if (rows.every((r) => r.verdict.status === "wont-run")) {
    return (
      <p className="empty">
        Nothing here fits this machine. Try a smaller quantisation, a shorter context, or
        an engine that can offload to system RAM — Ollama and llama.cpp both can.
      </p>
    );
  }

  return (
    <div className="verdicts">
      {rows.map((row) => (
        <ModelCard key={row.model.id} row={row} vramBytes={vramBytes} />
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/features/results/__tests__/results.test.tsx`
Expected: 5 tests PASS.

- [ ] **Step 8: Style the tight-fit badge and the empty state**

Append to `src/styles/tokens.css`:

```css
.badge.tight { background: var(--offload); color: var(--ink); border-style: solid; }
.empty { background: var(--card); color: var(--ink); border: var(--bw) dashed var(--ink-soft); border-radius: var(--r); padding: 22px; margin: 0; }
```

The tight-fit badge uses the offload amber deliberately: it is a warning, not a third
verdict, and it must never be mistaken for the green "Run on GPU" pill beside it.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/features/results/ src/styles/tokens.css
git commit -m "feat: add result scoring, stat tiles and the model list"
```

---

### Task 8: Filters, sort and the table view

**Files:**
- Create: `src/features/results/Filters.tsx`, `src/features/results/sort.ts`, `src/features/results/ModelTable.tsx`
- Test: `src/features/results/__tests__/filters.test.tsx`

**Interfaces:**
- Consumes: `ScoredModel` (T7), `Chip` (T4)
- Produces: `applyFilters(rows, { query, categories }): ScoredModel[]`, `sortRows(rows, key): ScoredModel[]` with `SortKey = "compatibility" | "size" | "name" | "params"`, `<Filters ... />`, `<ModelTable rows vramBytes />`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/results/__tests__/filters.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { GB, type HardwareSpec, type Settings } from "../../../lib/compat";
import { loadModels } from "../../../lib/data/load";
import { scoreModels } from "../useVerdicts";
import { applyFilters, sortRows } from "../sort";
import { ModelTable } from "../ModelTable";

const hw: HardwareSpec = { kind: "discrete-gpu", vramBytes: 12 * GB, ramBytes: 64 * GB };
const settings: Settings = { engine: "ollama", contextLength: 8192, kvPrecision: "fp16", quantId: "auto" };
const rows = scoreModels(loadModels(), hw, settings);

describe("applyFilters", () => {
  it("matches on display name, case-insensitively", () => {
    expect(applyFilters(rows, { query: "llama", categories: [] })).toHaveLength(2);
  });

  it("matches on family so a search for a series finds its members", () => {
    expect(applyFilters(rows, { query: "qwen3", categories: [] })).toHaveLength(1);
  });

  it("filters by category", () => {
    const reasoning = applyFilters(rows, { query: "", categories: ["reasoning"] });
    expect(reasoning.every((r) => r.model.categories.includes("reasoning"))).toBe(true);
    expect(reasoning.length).toBeGreaterThan(0);
  });

  it("returns everything when nothing is selected", () => {
    expect(applyFilters(rows, { query: "", categories: [] })).toHaveLength(rows.length);
  });
});

describe("sortRows", () => {
  it("puts runnable models first by compatibility", () => {
    expect(sortRows(rows, "compatibility")[0]?.verdict.status).toBe("run-on-gpu");
  });

  it("sorts by memory need ascending", () => {
    const sorted = sortRows(rows, "size");
    const totals = sorted.map((r) => r.verdict.breakdown.totalBytes);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
  });

  it("does not mutate its input", () => {
    const before = rows.map((r) => r.model.id);
    sortRows(rows, "size");
    expect(rows.map((r) => r.model.id)).toEqual(before);
  });
});

describe("ModelTable", () => {
  it("renders one row per model with a scrollable container", () => {
    render(
      <MemoryRouter>
        <ModelTable rows={rows} vramBytes={12 * GB} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(rows.length + 1); // + header
    expect(screen.getByTestId("table-scroll")).toHaveStyle({ overflowX: "auto" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/results/__tests__/filters.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/features/results/sort.ts`**

```ts
import type { Category, VerdictStatus } from "../../lib/compat";
import type { ScoredModel } from "./useVerdicts";

export type SortKey = "compatibility" | "size" | "name" | "params";

/** Runnable first; within a bucket, smallest memory need first. */
const STATUS_RANK: Record<VerdictStatus, number> = {
  "run-on-gpu": 0,
  "cpu-offloaded": 1,
  "wont-run": 2,
};

export function applyFilters(
  rows: ScoredModel[],
  { query, categories }: { query: string; categories: Category[] },
): ScoredModel[] {
  const q = query.trim().toLowerCase();
  return rows.filter(({ model }) => {
    const matchesQuery =
      q === "" ||
      model.displayName.toLowerCase().includes(q) ||
      model.family.toLowerCase().includes(q);
    const matchesCategory =
      categories.length === 0 || categories.some((c) => model.categories.includes(c));
    return matchesQuery && matchesCategory;
  });
}

export function sortRows(rows: ScoredModel[], key: SortKey): ScoredModel[] {
  const copy = [...rows];
  switch (key) {
    case "size":
      return copy.sort((a, b) => a.verdict.breakdown.totalBytes - b.verdict.breakdown.totalBytes);
    case "name":
      return copy.sort((a, b) => a.model.displayName.localeCompare(b.model.displayName));
    case "params":
      return copy.sort((a, b) => b.model.params.total - a.model.params.total);
    case "compatibility":
    default:
      return copy.sort(
        (a, b) =>
          STATUS_RANK[a.verdict.status] - STATUS_RANK[b.verdict.status] ||
          a.verdict.breakdown.totalBytes - b.verdict.breakdown.totalBytes,
      );
  }
}
```

- [ ] **Step 4: Write `src/features/results/Filters.tsx`**

```tsx
import { Chip } from "../../components/ui/Chip";
import type { Category } from "../../lib/compat";
import type { SortKey } from "./sort";

const CATEGORIES: Category[] = ["chat", "code", "reasoning", "vision"];

export function Filters({
  query,
  categories,
  sortKey,
  view,
  onQuery,
  onToggleCategory,
  onSort,
  onView,
}: {
  query: string;
  categories: Category[];
  sortKey: SortKey;
  view: "cards" | "table";
  onQuery: (q: string) => void;
  onToggleCategory: (c: Category) => void;
  onSort: (k: SortKey) => void;
  onView: (v: "cards" | "table") => void;
}) {
  return (
    <div className="filters">
      <input
        className="input"
        type="search"
        aria-label="Filter models"
        placeholder="Filter models…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />

      <div className="chips">
        {CATEGORIES.map((c) => (
          <Chip key={c} pressed={categories.includes(c)} onClick={() => onToggleCategory(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <select
        className="select"
        aria-label="Sort by"
        value={sortKey}
        onChange={(e) => onSort(e.target.value as SortKey)}
      >
        <option value="compatibility">Compatibility</option>
        <option value="size">Memory needed</option>
        <option value="params">Parameters</option>
        <option value="name">Name</option>
      </select>

      <div className="seg" role="group" aria-label="View">
        <button type="button" aria-pressed={view === "cards"} onClick={() => onView("cards")}>
          Cards
        </button>
        <button type="button" aria-pressed={view === "table"} onClick={() => onView("table")}>
          Table
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `src/features/results/ModelTable.tsx`**

```tsx
import { Link } from "react-router-dom";
import { VerdictPill } from "../../components/ui/Pill";
import { formatGB, formatPercent } from "../../lib/ui/format";
import type { ScoredModel } from "./useVerdicts";

export function ModelTable({ rows, vramBytes }: { rows: ScoredModel[]; vramBytes: number }) {
  return (
    <div data-testid="table-scroll" style={{ overflowX: "auto" }}>
      <table className="model-table">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Params</th>
            <th scope="col">Quant</th>
            <th scope="col">Needs</th>
            <th scope="col">Of your VRAM</th>
            <th scope="col">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ model, verdict }) => (
            <tr key={model.id}>
              <th scope="row">
                <Link to={`/model/${encodeURIComponent(model.id)}`}>{model.displayName}</Link>
              </th>
              <td>{(model.params.total / 1e9).toFixed(1)}B</td>
              <td>{verdict.quantId ?? "—"}</td>
              <td>{formatGB(verdict.breakdown.totalBytes)}</td>
              <td>{formatPercent(verdict.breakdown.totalBytes, vramBytes)}</td>
              <td>
                <VerdictPill status={verdict.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/features/results/__tests__/filters.test.tsx`
Expected: 8 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/results/
git commit -m "feat: add filtering, sorting and the table view"
```

---

### Task 9: Routing and the calculator page

**Files:**
- Create: `src/pages/CalculatorPage.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/pages/__tests__/CalculatorPage.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 4–8
- Produces: `<App />` with routes `/` and `/model/:id`; `<CalculatorPage />`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/__tests__/CalculatorPage.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CalculatorPage } from "../CalculatorPage";

const page = () =>
  render(
    <MemoryRouter>
      <CalculatorPage />
    </MemoryRouter>,
  );

describe("CalculatorPage", () => {
  it("renders results at rest, with no submit step", () => {
    page();
    expect(screen.getByTestId("tile-run-on-gpu")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /calculate|submit/i })).not.toBeInTheDocument();
  });

  it("re-scores live when VRAM changes", async () => {
    page();
    // 12 GB: the 8B fits. Drop to 4 GB and it must stop fitting.
    expect(screen.getByText("Run on GPU")).toBeInTheDocument();
    const vram = screen.getByLabelText(/vram/i);
    await userEvent.clear(vram);
    await userEvent.type(vram, "4");
    expect(screen.queryByText("Run on GPU")).not.toBeInTheDocument();
  });

  it("filters the list as you type", async () => {
    page();
    await userEvent.type(screen.getByLabelText(/filter models/i), "qwen");
    expect(screen.queryByText("Llama 3.1 8B Instruct")).not.toBeInTheDocument();
    expect(screen.getByText("Qwen3 235B A22B")).toBeInTheDocument();
  });

  it("switches to the table view", async () => {
    page();
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/__tests__/CalculatorPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/pages/CalculatorPage.tsx`**

```tsx
import { useMemo, useState } from "react";
import { HardwarePanel } from "../features/hardware/HardwarePanel";
import { Filters } from "../features/results/Filters";
import { ModelList } from "../features/results/ModelList";
import { ModelTable } from "../features/results/ModelTable";
import { StatTiles } from "../features/results/StatTiles";
import { applyFilters, sortRows, type SortKey } from "../features/results/sort";
import { useVerdicts } from "../features/results/useVerdicts";
import { useHardwareForm } from "../hooks/useHardwareForm";
import { usableVram, type Category } from "../lib/compat";
import { loadModels } from "../lib/data/load";

export function CalculatorPage() {
  const form = useHardwareForm();
  const models = loadModels();
  const rows = useVerdicts(models, form.hw, form.settings);

  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("compatibility");
  const [view, setView] = useState<"cards" | "table">("cards");

  const shown = useMemo(
    () => sortRows(applyFilters(rows, { query, categories }), sortKey),
    [rows, query, categories, sortKey],
  );

  const vram = usableVram(form.hw);

  return (
    <main className="wrap">
      <header className="mast">
        <div>
          <div className="label eyebrow">Will it run?</div>
          <h1>Runcheck</h1>
          <p>
            Tell it what you have. It tells you what you can run, and the arithmetic behind
            every answer.
          </p>
        </div>
      </header>

      <div className="layout">
        <HardwarePanel form={form} />

        <section className="results" aria-label="Results">
          <StatTiles rows={rows} />
          <Filters
            query={query}
            categories={categories}
            sortKey={sortKey}
            view={view}
            onQuery={setQuery}
            onToggleCategory={(c) =>
              setCategories((prev) =>
                prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
              )
            }
            onSort={setSortKey}
            onView={setView}
          />
          {view === "cards" ? (
            <ModelList rows={shown} vramBytes={vram} />
          ) : (
            <ModelTable rows={shown} vramBytes={vram} />
          )}
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Wire the routes in `src/App.tsx`**

```tsx
import { Route, Routes } from "react-router-dom";
import { CalculatorPage } from "./pages/CalculatorPage";
import { ModelReport } from "./features/report/ModelReport";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<CalculatorPage />} />
      <Route path="/model/:id" element={<ModelReport />} />
    </Routes>
  );
}
```

`ModelReport` arrives in Task 10. Until then, create a one-line placeholder at `src/features/report/ModelReport.tsx` exporting `export function ModelReport() { return null; }` so this task compiles and commits green; Task 10 replaces its body.

In `src/main.tsx`, wrap `<App />` in `<BrowserRouter>`:

```tsx
import { BrowserRouter } from "react-router-dom";
// ...
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
```

- [ ] **Step 5: Add the layout styles**

Append to `src/styles/tokens.css`:

```css
.wrap { max-width: 1180px; margin: 0 auto; padding: 40px 22px 96px; display: flex; flex-direction: column; gap: 34px; }
.layout { display: grid; grid-template-columns: 340px 1fr; gap: 26px; align-items: start; }
.hardware-panel { display: grid; gap: 18px; position: sticky; top: 22px; }
.results { display: flex; flex-direction: column; gap: 18px; }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.verdicts { display: grid; gap: 16px; }
.model-table { width: 100%; border-collapse: collapse; background: var(--card); color: var(--ink); border: var(--bw) solid var(--ink); border-radius: var(--r); }
.model-table th, .model-table td { padding: 10px 12px; text-align: left; border-bottom: 2px solid var(--ink-soft); font-variant-numeric: tabular-nums; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .hardware-panel { position: static; } .tiles { grid-template-columns: 1fr; } }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/pages/__tests__/CalculatorPage.test.tsx`
Expected: 4 tests PASS.

- [ ] **Step 7: Run the whole suite and the build, then look at it**

Run: `npm test && npm run build && npm run dev`
Open http://localhost:5173 and confirm the calculator renders with results visible at rest.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/main.tsx src/pages/ src/features/report/ src/styles/tokens.css
git commit -m "feat: add the calculator page and routing"
```

---

### Task 10: The model report

**Files:**
- Create: `src/features/report/MemoryBar.tsx`, `QuantTable.tsx`, `RunItBlock.tsx`
- Modify: `src/features/report/ModelReport.tsx` (replacing Task 9's placeholder)
- Test: `src/features/report/__tests__/report.test.tsx`

**Interfaces:**
- Consumes: `evaluate`, `runCommand`, `usableVram` from `src/lib/compat`; `loadModels` (T3); `useHardwareForm` (T5)
- Produces: `<ModelReport />` at `/model/:id`

Two things from `llmrun.dev` land here: a memory bar drawn to the VRAM scale, and **a row per quantisation level** so the user can see what dropping to Q4 would buy them. The second is nearly free — we hold the quant array and can call `evaluate()` once per quant.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/report/__tests__/report.test.tsx
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ModelReport } from "../ModelReport";

function at(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/model/${encodeURIComponent(id)}`]}>
      <Routes>
        <Route path="/model/:id" element={<ModelReport />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ModelReport", () => {
  it("shows the memory breakdown, summing to the total", () => {
    at("meta-llama/Llama-3.1-8B-Instruct");
    const bar = screen.getByTestId("memory-bar");
    expect(within(bar).getByTestId("seg-weights")).toBeInTheDocument();
    expect(screen.getByText("4.92 GB")).toBeInTheDocument(); // weights
    expect(screen.getByText("1.07 GB")).toBeInTheDocument(); // kv
    expect(screen.getByText("6.59 GB")).toBeInTheDocument(); // total
  });

  it("lists a verdict for every quantisation the model ships", () => {
    at("meta-llama/Llama-3.1-8B-Instruct");
    const table = screen.getByTestId("quant-table");
    expect(within(table).getByText("Q4_K_M")).toBeInTheDocument();
    expect(within(table).getByText("AWQ-4bit")).toBeInTheDocument();
  });

  it("shows the run command for a model that fits", () => {
    at("meta-llama/Llama-3.1-8B-Instruct");
    expect(screen.getByTestId("run-it")).toHaveTextContent(
      "ollama run llama-3.1-8b-instruct:Q4_K_M",
    );
  });

  it("shows no run command for a model that will not run", () => {
    at("Qwen/Qwen3-235B-A22B");
    expect(screen.queryByTestId("run-it")).not.toBeInTheDocument();
    expect(screen.getByText(/Won't run/)).toBeInTheDocument();
  });

  it("reports an unknown model instead of crashing", () => {
    at("nobody/not-a-model");
    expect(screen.getByText(/not tracked/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/report/__tests__/report.test.tsx`
Expected: FAIL — the placeholder renders `null`.

- [ ] **Step 3: Write `src/features/report/MemoryBar.tsx`**

```tsx
import { formatGB } from "../../lib/ui/format";
import type { Verdict } from "../../lib/compat";

/** Drawn to the VRAM scale, so the free remainder is honest. */
export function MemoryBar({ verdict, vramBytes }: { verdict: Verdict; vramBytes: number }) {
  const { weightsBytes, kvCacheBytes, overheadBytes, totalBytes } = verdict.breakdown;
  const scale = Math.max(vramBytes, totalBytes);
  const pct = (n: number) => `${(n / scale) * 100}%`;
  const free = Math.max(0, vramBytes - totalBytes);

  return (
    <>
      <div
        className="bar"
        data-testid="memory-bar"
        role="img"
        aria-label={`Weights ${formatGB(weightsBytes)}, KV cache ${formatGB(kvCacheBytes)}, overhead ${formatGB(overheadBytes)}, of ${formatGB(vramBytes)} VRAM`}
      >
        <span data-testid="seg-weights" className="seg-w" style={{ width: pct(weightsBytes) }} />
        <span className="seg-k" style={{ width: pct(kvCacheBytes) }} />
        <span className="seg-o" style={{ width: pct(overheadBytes) }} />
        <span className="seg-r" style={{ width: pct(free) }} />
      </div>
      <div className="legend">
        <span><i className="seg-w" /> Weights {formatGB(weightsBytes)}</span>
        <span><i className="seg-k" /> KV cache {formatGB(kvCacheBytes)}</span>
        <span><i className="seg-o" /> Overhead {formatGB(overheadBytes)}</span>
        <span><i className="seg-t" /> Total {formatGB(totalBytes)}</span>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Write `src/features/report/QuantTable.tsx`**

```tsx
import { VerdictPill } from "../../components/ui/Pill";
import { Badge } from "../../components/ui/Badge";
import { evaluate, type HardwareSpec, type ModelSpec, type Settings } from "../../lib/compat";
import { formatGB, formatPercent } from "../../lib/ui/format";

/**
 * One row per quantisation the model actually ships, each scored against the
 * same hardware — so "what would Q4 buy me?" is answered without the user
 * changing anything.
 */
export function QuantTable({
  model,
  hw,
  settings,
  vramBytes,
}: {
  model: ModelSpec;
  hw: HardwareSpec;
  settings: Settings;
  vramBytes: number;
}) {
  return (
    <div data-testid="quant-table" style={{ overflowX: "auto" }}>
      <table className="model-table">
        <thead>
          <tr>
            <th scope="col">Quantisation</th>
            <th scope="col">Format</th>
            <th scope="col">Needs</th>
            <th scope="col">Of your VRAM</th>
            <th scope="col">Size from</th>
            <th scope="col">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {model.quants.map((q) => {
            const v = evaluate(model, hw, { ...settings, quantId: q.id });
            return (
              <tr key={q.id}>
                <th scope="row">{q.id}</th>
                <td>{q.format}</td>
                <td>{formatGB(v.breakdown.totalBytes)}</td>
                <td>{formatPercent(v.breakdown.totalBytes, vramBytes)}</td>
                <td><Badge source={q.sizeSource} /></td>
                <td><VerdictPill status={v.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Write `src/features/report/RunItBlock.tsx`**

```tsx
import { useState } from "react";

export function RunItBlock({ command, engineLabel }: { command: string; engineLabel: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <section className="runit" data-testid="run-it" aria-label="Run this model">
      <div className="runit-head">
        <span className="label">Run this model</span>
        <button
          type="button"
          className="copy"
          onClick={() => {
            void navigator.clipboard?.writeText(command);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <span className="engine">{engineLabel}</span>
      </div>
      <pre>{command}</pre>
    </section>
  );
}
```

- [ ] **Step 6: Write `src/features/report/ModelReport.tsx`**

```tsx
import { Link, useParams } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { VerdictPill } from "../../components/ui/Pill";
import { evaluate, getEngine, runCommand, usableVram } from "../../lib/compat";
import { loadModels } from "../../lib/data/load";
import { formatTokens } from "../../lib/ui/format";
import { useHardwareForm } from "../../hooks/useHardwareForm";
import { MemoryBar } from "./MemoryBar";
import { QuantTable } from "./QuantTable";
import { RunItBlock } from "./RunItBlock";

export function ModelReport() {
  const { id } = useParams();
  const form = useHardwareForm();
  const model = loadModels().find((m) => m.id === decodeURIComponent(id ?? ""));

  if (!model) {
    return (
      <main className="wrap">
        <p className="panel">
          That model is not tracked. <Link to="/">Back to the calculator</Link>.
        </p>
      </main>
    );
  }

  const verdict = evaluate(model, form.hw, form.settings);
  const vram = usableVram(form.hw);
  const command = runCommand(model, form.settings, verdict);

  return (
    <main className="wrap">
      <Link className="label" to="/">← Back to all models</Link>

      <header className="mast">
        <div>
          <h1>{model.displayName}</h1>
          <p className="v-arch">
            {model.arch.numLayers} layers · {model.arch.numKvHeads} KV heads · up to{" "}
            {formatTokens(model.arch.maxContext)} tokens
          </p>
        </div>
        <div className="mast-side">
          <Badge source={verdict.confidence} />
          <VerdictPill status={verdict.status} />
        </div>
      </header>

      <section className="panel">
        <MemoryBar verdict={verdict} vramBytes={vram} />
        {verdict.notes[0] ? (
          <p className="why"><b>Why</b> <span>{verdict.notes[0]}</span></p>
        ) : null}
      </section>

      <section className="panel">
        <h2 className="label">Every quantisation on your hardware</h2>
        <QuantTable model={model} hw={form.hw} settings={form.settings} vramBytes={vram} />
      </section>

      {command ? (
        <RunItBlock command={command} engineLabel={getEngine(form.settings.engine).label} />
      ) : null}
    </main>
  );
}
```

- [ ] **Step 7: Add the report styles**

Append the `.bar`, `.bar > span`, `.seg-w/.seg-k/.seg-o/.seg-r/.seg-t`, `.legend`, `.why`, `.runit`, `.runit-head`, `.copy` and `.mast-side` rules to `src/styles/tokens.css`, copied from the corresponding blocks in `docs/design/style-reference.html`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/features/report/__tests__/report.test.tsx`
Expected: 5 tests PASS.

- [ ] **Step 9: Run the whole suite and the build, then look at it**

Run: `npm test && npm run build && npm run dev`
Open http://localhost:5173, click through to a model, and confirm the bar, the quant table and the run command all render.

- [ ] **Step 10: Commit**

```bash
git add src/features/report/ src/styles/tokens.css
git commit -m "feat: add the per-model report with memory bar and run command"
```

---

## Done when

- `npm test` passes — roughly 110 tests across the engine, data layer, primitives, hooks, features and pages.
- `npm run build` typechecks and builds.
- The three golden anchors are unchanged: `6_591_932_032`, `45_781_810_560`, `gpuLayers` 16.
- `npm run dev` serves a calculator that shows results at rest, re-scores live on every input change, and links through to a per-model report.
- vLLM on Apple Silicon returns **Won't run**, not Run on GPU.
- A too-long context returns Won't run **with a full memory breakdown**.

## Notes for whoever executes this

**The UI must never re-implement the math.** If a number can come from `evaluate()`, it comes from `evaluate()`. The one exception is `formatPercent`, which is presentation — and it deliberately does not clamp at 100%, because "200%" is the useful signal.

**Form state is the truth.** Task 5's fourth test is the one that matters: a laptop prefill followed by a manual RAM edit must keep the manual value. If you find yourself adding an "unlock" or "custom" mode, stop — the design says lookups prefill and then have no authority.

**Colour is never the only signal.** Every verdict carries a glyph and a word. Check any new surface in greyscale before calling it done.

**The quant dropdown is a correctness surface, not a convenience.** `selectQuant` collapses
two failure modes into one `null`, and its note ("cannot load any quantisation of this model")
is only true for one of them. Filtering the dropdown by `engine.formats` is what makes the
other case unreachable. If you ever widen that dropdown, fix the note first.

**Three items are deliberately NOT in this plan** and belong to Plan 4: the coach-mark tour, the benchmarks page, and `/detect` with the local spec-detection script.
