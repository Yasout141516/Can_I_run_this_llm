# Foundation & Compatibility Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, fully tested compatibility engine and validated data layer that every other part of the app consumes.

**Architecture:** A single pure TypeScript module, `src/lib/compat/`, with no React, no `fetch`, and no file I/O. Its public surface is `evaluate(model, hw, settings): Verdict`. Data files are validated by Zod schemas that double as the CI gate for the ingestion pipeline. Every formula is developed test-first against known-good real-world numbers.

**Tech Stack:** Vite, React 18, TypeScript 5, Vitest, Zod. No other runtime dependencies.

**Spec:** [`docs/superpowers/specs/2026-09-12-llm-hardware-compatibility-checker-design.md`](../specs/2026-09-12-llm-hardware-compatibility-checker-design.md)

## Global Constraints

- **Node 20+.** Required for the ingestion pipeline in Plan 3; adopt it now.
- **No network calls at runtime.** The app loads static JSON bundled at build time.
- **`src/lib/compat/` stays pure.** No React imports, no `fetch`, no `fs`, no `Date.now()`. Given the same inputs it returns the same output, forever.
- **Bytes internally, decimal GB at the edges.** `1 GB = 1_000_000_000` bytes, matching how GPU VRAM and GGUF file sizes are quoted. This is deliberately conservative: a "12 GB" card actually holds 12 GiB (12.88e9 bytes), so treating it as 12.0e9 errs toward saying something won't fit. Never mix GiB in.
- **Named constants, never literals.** Every tunable — `RAM_RESERVE_FRACTION`, `APPLE_WIRED_FRACTION`, per-engine overhead — is an exported named constant in one place.
- **TDD throughout.** Test first, watch it fail, minimal implementation, watch it pass, commit.
- **Commit after every task.** Conventional commit messages (`feat:`, `test:`, `chore:`).

## Plan set

This is **Plan 1 of 4**. The others are separate because they share only file formats, not code:

| Plan | Covers |
|---|---|
| **1 (this)** | Scaffold, domain types, schemas, compatibility engine, seed data |
| 2 | Calculator UI — design tokens, hardware panel, model list, detail route |
| 3 | Ingestion pipeline + GitHub Actions cron |
| 4 | Benchmarks page, `/detect`, coach-mark tour |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`
- Test: `src/lib/compat/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test` and `npm run build`. All later tasks assume Vitest resolves `src/**/*.test.ts`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "runcheck",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@vitejs/plugin-react": "4.3.3",
    "typescript": "5.6.3",
    "vite": "5.4.11",
    "vitest": "2.1.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

`strict` is non-negotiable — this project's whole premise is that a typo in a field name must not become a wrong VRAM number.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
```

- [ ] **Step 4: Create `index.html`, `src/main.tsx`, `src/App.tsx`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Runcheck</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

```tsx
// src/App.tsx
export function App() {
  return <h1>Runcheck</h1>;
}
```

- [ ] **Step 5: Write the smoke test**

```ts
// src/lib/compat/__tests__/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Install and run**

Run: `npm install && npm test`
Expected: 1 test passes.

- [ ] **Step 7: Verify the build typechecks**

Run: `npm run build`
Expected: exits 0, writes `dist/`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/
git commit -m "chore: scaffold Vite + React + TypeScript + Vitest"
```

---

### Task 2: Domain types and runtime schemas

**Files:**
- Create: `src/lib/compat/types.ts`, `src/lib/data/schema.ts`
- Test: `src/lib/data/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: Task 1's harness
- Produces: `ModelSpec`, `QuantOption`, `ModelArch`, `HardwareSpec`, `Settings`, `Verdict`, `EngineId`, `QuantFormat`, `KvPrecision`, `Category`, `BenchmarkId`, `RamType`; and `modelsFileSchema`, `gpusFileSchema`, `laptopsFileSchema`, `SCHEMA_VERSION`.

- [ ] **Step 1: Write `src/lib/compat/types.ts`**

```ts
export type EngineId = "ollama" | "llamacpp" | "koboldcpp" | "vllm" | "tgi" | "sglang";
export type QuantFormat = "gguf" | "awq" | "gptq" | "fp8" | "safetensors";
export type KvPrecision = "fp16" | "q8" | "q4";
export type RamType = "DDR4" | "DDR5" | "LPDDR4X" | "LPDDR5" | "LPDDR5X" | "unified";
export type Category =
  | "chat" | "code" | "reasoning" | "vision"
  | "embedding" | "medical" | "finance" | "legal";
export type BenchmarkId =
  | "mmlu" | "mmlu_pro" | "gpqa" | "humaneval" | "math" | "ifeval" | "swe_bench";

export interface ModelArch {
  numLayers: number;
  numKvHeads: number;
  headDim: number;
  maxContext: number;
}

export interface QuantOption {
  id: string;
  format: QuantFormat;
  sizeBytes: number;
  sizeSource: "measured" | "estimated";
  fileName?: string;
}

export interface ModelSpec {
  id: string;
  family: string;
  displayName: string;
  params: { total: number; active: number | null };
  arch: ModelArch;
  quants: QuantOption[];
  benchmarks: Partial<Record<BenchmarkId, number | null>>;
  categories: Category[];
  source: { hfRepo: string; ggufRepo?: string; fetchedAt: string };
}

export interface HardwareSpec {
  kind: "discrete-gpu" | "apple-silicon" | "cpu-only";
  /** For apple-silicon this is ignored; the unified pool is `ramBytes`. */
  vramBytes: number;
  ramBytes: number;
  ramType?: RamType;
  memBandwidthGBs?: number;
}

export interface Settings {
  engine: EngineId;
  contextLength: number;
  kvPrecision: KvPrecision;
  quantId: string | "auto";
}

export type VerdictStatus = "run-on-gpu" | "cpu-offloaded" | "wont-run";
export type LimitingFactor = "vram" | "ram" | "context" | "format";

export interface Verdict {
  status: VerdictStatus;
  breakdown: {
    weightsBytes: number;
    kvCacheBytes: number;
    overheadBytes: number;
    totalBytes: number;
  };
  confidence: "measured" | "estimated";
  quantId: string | null;
  gpuLayers?: number;
  limitingFactor?: LimitingFactor;
  notes: string[];
}
```

- [ ] **Step 2: Write the failing schema test**

```ts
// src/lib/data/__tests__/schema.test.ts
import { describe, expect, it } from "vitest";
import { modelsFileSchema, SCHEMA_VERSION } from "../schema";

const validModel = {
  id: "meta-llama/Llama-3.1-8B-Instruct",
  family: "Llama 3.1",
  displayName: "Llama 3.1 8B Instruct",
  params: { total: 8_030_000_000, active: null },
  arch: { numLayers: 32, numKvHeads: 8, headDim: 128, maxContext: 131_072 },
  quants: [
    {
      id: "Q4_K_M",
      format: "gguf",
      sizeBytes: 4_920_734_208,
      sizeSource: "measured",
      fileName: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    },
  ],
  benchmarks: { mmlu: 69.4 },
  categories: ["chat"],
  source: { hfRepo: "meta-llama/Llama-3.1-8B-Instruct", fetchedAt: "2026-09-12T00:00:00Z" },
};

const file = (models: unknown[]) => ({ schemaVersion: SCHEMA_VERSION, models });

describe("modelsFileSchema", () => {
  it("accepts a well-formed model", () => {
    expect(modelsFileSchema.safeParse(file([validModel])).success).toBe(true);
  });

  it("rejects a model missing numKvHeads", () => {
    const { numKvHeads, ...arch } = validModel.arch;
    const result = modelsFileSchema.safeParse(file([{ ...validModel, arch }]));
    expect(result.success).toBe(false);
  });

  it("rejects a wrong schemaVersion so stale data cannot be misread", () => {
    const result = modelsFileSchema.safeParse({ schemaVersion: 99, models: [validModel] });
    expect(result.success).toBe(false);
  });

  it("rejects a measured quant with no fileName", () => {
    const quants = [{ ...validModel.quants[0], fileName: undefined }];
    expect(modelsFileSchema.safeParse(file([{ ...validModel, quants }])).success).toBe(false);
  });

  it("rejects a negative parameter count", () => {
    const params = { total: -1, active: null };
    expect(modelsFileSchema.safeParse(file([{ ...validModel, params }])).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/data/__tests__/schema.test.ts`
Expected: FAIL — `Cannot find module '../schema'`.

- [ ] **Step 4: Write `src/lib/data/schema.ts`**

```ts
import { z } from "zod";

export const SCHEMA_VERSION = 1;

const positive = z.number().positive();

export const quantSchema = z
  .object({
    id: z.string().min(1),
    format: z.enum(["gguf", "awq", "gptq", "fp8", "safetensors"]),
    sizeBytes: positive,
    sizeSource: z.enum(["measured", "estimated"]),
    fileName: z.string().min(1).optional(),
  })
  .refine((q) => q.sizeSource !== "measured" || q.fileName !== undefined, {
    message: "a measured size must name the file it was measured from",
    path: ["fileName"],
  });

export const modelSchema = z.object({
  id: z.string().min(1),
  family: z.string().min(1),
  displayName: z.string().min(1),
  params: z.object({ total: positive, active: positive.nullable() }),
  arch: z.object({
    numLayers: positive.int(),
    numKvHeads: positive.int(),
    headDim: positive.int(),
    maxContext: positive.int(),
  }),
  quants: z.array(quantSchema).min(1),
  benchmarks: z.record(z.number().nullable()),
  categories: z
    .array(z.enum(["chat", "code", "reasoning", "vision", "embedding", "medical", "finance", "legal"]))
    .min(1),
  source: z.object({
    hfRepo: z.string().min(1),
    ggufRepo: z.string().optional(),
    fetchedAt: z.string().min(1),
  }),
});

export const modelsFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  models: z.array(modelSchema),
});

export const gpusFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  gpus: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      vendor: z.enum(["nvidia", "amd", "intel", "apple"]),
      vramBytes: positive,
      memBandwidthGBs: positive.optional(),
    }),
  ),
});

export const laptopsFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  laptops: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      kind: z.enum(["discrete-gpu", "apple-silicon", "cpu-only"]),
      gpuId: z.string().nullable(),
      vramBytes: z.number().nonnegative(),
      ramBytes: positive,
      ramType: z.enum(["DDR4", "DDR5", "LPDDR4X", "LPDDR5", "LPDDR5X", "unified"]),
    }),
  ),
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/__tests__/schema.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compat/types.ts src/lib/data/schema.ts src/lib/data/__tests__/schema.test.ts
git commit -m "feat: add domain types and runtime data schemas"
```

---

### Task 3: Quantisation sizing

**Files:**
- Create: `src/lib/compat/quant.ts`
- Test: `src/lib/compat/__tests__/quant.test.ts`

**Interfaces:**
- Consumes: `ModelSpec`, `QuantOption` from Task 2
- Produces: `GGUF_BPW`, `NON_GGUF_BPW`, `bitsPerWeight(quantId: string): number`, `weightBytes(model: ModelSpec, quant: QuantOption): number`

- [ ] **Step 1: Write the failing test**

The 7B anchors come straight from the spec: ≈14 GB at FP16, ≈4 GB at Q4_K_M.

```ts
// src/lib/compat/__tests__/quant.test.ts
import { describe, expect, it } from "vitest";
import { bitsPerWeight, weightBytes } from "../quant";
import type { ModelSpec, QuantOption } from "../types";

const GB = 1_000_000_000;

const model7b = {
  params: { total: 7_000_000_000, active: null },
} as ModelSpec;

const estimated = (id: string, format: QuantOption["format"] = "gguf"): QuantOption => ({
  id,
  format,
  sizeBytes: 0,
  sizeSource: "estimated",
});

describe("bitsPerWeight", () => {
  it("returns the GGUF k-quant approximation", () => {
    expect(bitsPerWeight("Q4_K_M")).toBe(4.8);
  });

  it("returns the non-GGUF value from its own table", () => {
    expect(bitsPerWeight("AWQ-4bit")).toBe(4.25);
  });

  it("throws on an unknown quantisation rather than guessing", () => {
    expect(() => bitsPerWeight("Q9_WAT")).toThrow(/Unknown quantisation/);
  });
});

describe("weightBytes", () => {
  it("estimates a 7B at FP16 as ~14 GB", () => {
    expect(weightBytes(model7b, estimated("FP16")) / GB).toBeCloseTo(14, 2);
  });

  it("estimates a 7B at Q4_K_M as ~4.2 GB", () => {
    expect(weightBytes(model7b, estimated("Q4_K_M")) / GB).toBeCloseTo(4.2, 2);
  });

  it("prefers a measured file size over the formula", () => {
    const measured: QuantOption = {
      id: "Q4_K_M",
      format: "gguf",
      sizeBytes: 4_920_734_208,
      sizeSource: "measured",
      fileName: "x.gguf",
    };
    expect(weightBytes(model7b, measured)).toBe(4_920_734_208);
  });

  it("uses total params, not active, for a MoE model", () => {
    const moe = { params: { total: 235_000_000_000, active: 22_000_000_000 } } as ModelSpec;
    expect(weightBytes(moe, estimated("Q4_K_M")) / GB).toBeCloseTo(141, 0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/compat/__tests__/quant.test.ts`
Expected: FAIL — `Cannot find module '../quant'`.

- [ ] **Step 3: Write `src/lib/compat/quant.ts`**

```ts
import type { ModelSpec, QuantOption } from "./types";

/**
 * GGUF k-quants mix precision per block, so these are commonly-cited
 * approximations, not exact values. A measured file size always wins.
 */
export const GGUF_BPW: Readonly<Record<string, number>> = {
  FP16: 16,
  BF16: 16,
  Q8_0: 8.5,
  Q6_K: 6.6,
  Q5_K_M: 5.7,
  Q4_K_M: 4.8,
  Q4_0: 4.5,
  Q3_K_M: 3.9,
  Q2_K: 2.6,
};

/** Not k-quants. Sharing one table with GGUF would silently misprice these. */
export const NON_GGUF_BPW: Readonly<Record<string, number>> = {
  "AWQ-4bit": 4.25,
  "GPTQ-4bit": 4.25,
  "GPTQ-8bit": 8.25,
  FP8: 8,
  INT8: 8,
};

export function bitsPerWeight(quantId: string): number {
  const bpw = GGUF_BPW[quantId] ?? NON_GGUF_BPW[quantId];
  if (bpw === undefined) throw new Error(`Unknown quantisation: ${quantId}`);
  return bpw;
}

export function weightBytes(model: ModelSpec, quant: QuantOption): number {
  if (quant.sizeSource === "measured") return quant.sizeBytes;
  return (model.params.total * bitsPerWeight(quant.id)) / 8;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/compat/__tests__/quant.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compat/quant.ts src/lib/compat/__tests__/quant.test.ts
git commit -m "feat: add quantisation sizing with measured-over-estimated precedence"
```

---

### Task 4: KV cache sizing

**Files:**
- Create: `src/lib/compat/kvCache.ts`
- Test: `src/lib/compat/__tests__/kvCache.test.ts`

**Interfaces:**
- Consumes: `ModelArch`, `KvPrecision` from Task 2
- Produces: `KV_BYTES_PER_ELEMENT`, `kvCacheBytes(arch: ModelArch, contextLength: number, precision: KvPrecision): number`

- [ ] **Step 1: Write the failing test**

Llama 3.1 8B at 8192 tokens works out to exactly 1,073,741,824 bytes — an exact integer, so assert it exactly rather than approximately.

```ts
// src/lib/compat/__tests__/kvCache.test.ts
import { describe, expect, it } from "vitest";
import { kvCacheBytes } from "../kvCache";
import type { ModelArch } from "../types";

const llama8b: ModelArch = { numLayers: 32, numKvHeads: 8, headDim: 128, maxContext: 131_072 };

describe("kvCacheBytes", () => {
  it("computes Llama 3.1 8B at 8K context, fp16, exactly", () => {
    expect(kvCacheBytes(llama8b, 8192, "fp16")).toBe(1_073_741_824);
  });

  it("halves at q8 and quarters at q4", () => {
    const fp16 = kvCacheBytes(llama8b, 8192, "fp16");
    expect(kvCacheBytes(llama8b, 8192, "q8")).toBe(fp16 / 2);
    expect(kvCacheBytes(llama8b, 8192, "q4")).toBe(fp16 / 4);
  });

  it("scales linearly with context length", () => {
    const at8k = kvCacheBytes(llama8b, 8192, "fp16");
    expect(kvCacheBytes(llama8b, 16_384, "fp16")).toBe(at8k * 2);
  });

  it("costs 4x more without GQA — 32 KV heads instead of 8", () => {
    const mha: ModelArch = { ...llama8b, numKvHeads: 32 };
    expect(kvCacheBytes(mha, 8192, "fp16")).toBe(kvCacheBytes(llama8b, 8192, "fp16") * 4);
  });

  it("is zero at zero context", () => {
    expect(kvCacheBytes(llama8b, 0, "fp16")).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/compat/__tests__/kvCache.test.ts`
Expected: FAIL — `Cannot find module '../kvCache'`.

- [ ] **Step 3: Write `src/lib/compat/kvCache.ts`**

```ts
import type { KvPrecision, ModelArch } from "./types";

export const KV_BYTES_PER_ELEMENT: Readonly<Record<KvPrecision, number>> = {
  fp16: 2,
  q8: 1,
  q4: 0.5,
};

/**
 * The leading 2 is the K and V tensors. `numKvHeads` — not attention heads —
 * is what matters: a GQA model with 8 KV heads against 64 query heads pays
 * one eighth the cache of an equivalent MHA model.
 */
export function kvCacheBytes(
  arch: ModelArch,
  contextLength: number,
  precision: KvPrecision,
): number {
  return (
    2 *
    arch.numLayers *
    arch.numKvHeads *
    arch.headDim *
    contextLength *
    KV_BYTES_PER_ELEMENT[precision]
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/compat/__tests__/kvCache.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compat/kvCache.ts src/lib/compat/__tests__/kvCache.test.ts
git commit -m "feat: add KV cache sizing"
```

---

### Task 5: Engine profiles

**Files:**
- Create: `src/lib/compat/engines.ts`
- Test: `src/lib/compat/__tests__/engines.test.ts`

**Interfaces:**
- Consumes: `EngineId`, `QuantFormat` from Task 2
- Produces: `EngineProfile` interface, `ENGINES: Record<EngineId, EngineProfile>`, `getEngine(id: EngineId): EngineProfile`, `overheadBytes(engine: EngineProfile, contextLength: number): number`

`EngineProfile` deliberately does **not** carry `runCommand` — that needs a `Verdict`, which needs engines, and the cycle would be real. Command templates live in Task 8.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/compat/__tests__/engines.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/compat/__tests__/engines.test.ts`
Expected: FAIL — `Cannot find module '../engines'`.

- [ ] **Step 3: Write `src/lib/compat/engines.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/compat/__tests__/engines.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compat/engines.ts src/lib/compat/__tests__/engines.test.ts
git commit -m "feat: add engine profiles as a data table"
```

---

### Task 6: Memory budget

**Files:**
- Create: `src/lib/compat/memory.ts`
- Test: `src/lib/compat/__tests__/memory.test.ts`

**Interfaces:**
- Consumes: `HardwareSpec` from Task 2
- Produces: `GB`, `RAM_RESERVE_FRACTION`, `RAM_RESERVE_FLOOR`, `APPLE_WIRED_FRACTION`, `APPLE_SOFT_CEILING`, `usableVram(hw: HardwareSpec): number`, `usableRam(hw: HardwareSpec): number`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/compat/__tests__/memory.test.ts
import { describe, expect, it } from "vitest";
import { GB, usableRam, usableVram } from "../memory";
import type { HardwareSpec } from "../types";

const desktop = (vram: number, ram: number): HardwareSpec => ({
  kind: "discrete-gpu",
  vramBytes: vram * GB,
  ramBytes: ram * GB,
});

describe("usableRam", () => {
  it("reserves 15% on a large-RAM machine", () => {
    expect(usableRam(desktop(12, 64)) / GB).toBeCloseTo(54.4, 5);
  });

  it("reserves a 2 GB floor when 15% would be less", () => {
    expect(usableRam(desktop(8, 8)) / GB).toBeCloseTo(6, 5);
  });

  it("never goes negative on a tiny machine", () => {
    expect(usableRam(desktop(4, 2))).toBe(0);
  });

  it("is zero on Apple Silicon, where there is no separate pool to spill into", () => {
    const mac: HardwareSpec = { kind: "apple-silicon", vramBytes: 0, ramBytes: 32 * GB };
    expect(usableRam(mac)).toBe(0);
  });
});

describe("usableVram", () => {
  it("is the full VRAM on a discrete GPU", () => {
    expect(usableVram(desktop(12, 64))).toBe(12 * GB);
  });

  it("is 75% of the unified pool on Apple Silicon", () => {
    const mac: HardwareSpec = { kind: "apple-silicon", vramBytes: 0, ramBytes: 32 * GB };
    expect(usableVram(mac) / GB).toBeCloseTo(24, 5);
  });

  it("is zero on a CPU-only machine", () => {
    const cpu: HardwareSpec = { kind: "cpu-only", vramBytes: 0, ramBytes: 16 * GB };
    expect(usableVram(cpu)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/compat/__tests__/memory.test.ts`
Expected: FAIL — `Cannot find module '../memory'`.

- [ ] **Step 3: Write `src/lib/compat/memory.ts`**

```ts
import type { HardwareSpec } from "./types";

/** Decimal GB, matching how VRAM and GGUF file sizes are quoted. */
export const GB = 1_000_000_000;

export const RAM_RESERVE_FRACTION = 0.15;
export const RAM_RESERVE_FLOOR = 2 * GB;

/** macOS default wired-memory limit; user-adjustable via iogpu.wired_limit_pct. */
export const APPLE_WIRED_FRACTION = 0.75;
/** Above the wired limit a unified-memory machine still runs, badly. */
export const APPLE_SOFT_CEILING = 0.9;

/**
 * Not all system RAM is available — the OS needs headroom. Treating 32 GB as
 * 32 GB is how you promise someone a model that thrashes their machine.
 */
export function usableRam(hw: HardwareSpec): number {
  if (hw.kind === "apple-silicon") return 0;
  const reserve = Math.max(hw.ramBytes * RAM_RESERVE_FRACTION, RAM_RESERVE_FLOOR);
  return Math.max(0, hw.ramBytes - reserve);
}

export function usableVram(hw: HardwareSpec): number {
  if (hw.kind === "apple-silicon") return hw.ramBytes * APPLE_WIRED_FRACTION;
  if (hw.kind === "cpu-only") return 0;
  return hw.vramBytes;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/compat/__tests__/memory.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compat/memory.ts src/lib/compat/__tests__/memory.test.ts
git commit -m "feat: add memory budget with OS reserve and Apple unified-pool handling"
```

---

### Task 7: `evaluate()` — the verdict

**Files:**
- Create: `src/lib/compat/evaluate.ts`, `src/lib/compat/__tests__/fixtures.ts`
- Test: `src/lib/compat/__tests__/evaluate.test.ts`

**Interfaces:**
- Consumes: `weightBytes` (T3), `kvCacheBytes` (T4), `getEngine`/`overheadBytes` (T5), `usableVram`/`usableRam` (T6)
- Produces: `evaluate(model: ModelSpec, hw: HardwareSpec, settings: Settings): Verdict`, `selectQuant(model: ModelSpec, settings: Settings): QuantOption | null`

- [ ] **Step 1: Write the fixtures**

These three models are the golden anchors. Their expected totals are reproduced in the style reference at `docs/design/style-reference.html`; if you change a constant and these move, that page is now wrong too.

```ts
// src/lib/compat/__tests__/fixtures.ts
import { GB } from "../memory";
import type { HardwareSpec, ModelSpec } from "../types";

export const llama8b: ModelSpec = {
  id: "meta-llama/Llama-3.1-8B-Instruct",
  family: "Llama 3.1",
  displayName: "Llama 3.1 8B Instruct",
  params: { total: 8_030_000_000, active: null },
  arch: { numLayers: 32, numKvHeads: 8, headDim: 128, maxContext: 131_072 },
  quants: [
    { id: "Q4_K_M", format: "gguf", sizeBytes: 4_920_734_208, sizeSource: "measured", fileName: "Llama-3.1-8B-Instruct-Q4_K_M.gguf" },
    { id: "AWQ-4bit", format: "awq", sizeBytes: 0, sizeSource: "estimated" },
  ],
  benchmarks: { mmlu: 69.4 },
  categories: ["chat"],
  source: { hfRepo: "meta-llama/Llama-3.1-8B-Instruct", fetchedAt: "2026-09-12T00:00:00Z" },
};

export const llama70b: ModelSpec = {
  id: "meta-llama/Llama-3.3-70B-Instruct",
  family: "Llama 3.3",
  displayName: "Llama 3.3 70B Instruct",
  params: { total: 70_600_000_000, active: null },
  arch: { numLayers: 80, numKvHeads: 8, headDim: 128, maxContext: 131_072 },
  quants: [
    { id: "Q4_K_M", format: "gguf", sizeBytes: 42_500_000_000, sizeSource: "measured", fileName: "Llama-3.3-70B-Instruct-Q4_K_M.gguf" },
  ],
  benchmarks: { mmlu: 86.0 },
  categories: ["chat", "reasoning"],
  source: { hfRepo: "meta-llama/Llama-3.3-70B-Instruct", fetchedAt: "2026-09-12T00:00:00Z" },
};

export const qwen235bMoe: ModelSpec = {
  id: "Qwen/Qwen3-235B-A22B",
  family: "Qwen3",
  displayName: "Qwen3 235B A22B",
  params: { total: 235_000_000_000, active: 22_000_000_000 },
  arch: { numLayers: 94, numKvHeads: 4, headDim: 128, maxContext: 32_768 },
  quants: [{ id: "Q4_K_M", format: "gguf", sizeBytes: 0, sizeSource: "estimated" }],
  benchmarks: { mmlu: null },
  categories: ["reasoning"],
  source: { hfRepo: "Qwen/Qwen3-235B-A22B", fetchedAt: "2026-09-12T00:00:00Z" },
};

/** RTX 4070, 12 GB VRAM, 64 GB DDR5 — the reference machine. */
export const rtx4070: HardwareSpec = {
  kind: "discrete-gpu",
  vramBytes: 12 * GB,
  ramBytes: 64 * GB,
  ramType: "DDR5",
};
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/compat/__tests__/evaluate.test.ts
import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { GB } from "../memory";
import { llama8b, llama70b, qwen235bMoe, rtx4070 } from "./fixtures";
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
    expect(v.breakdown.weightsBytes).toBe(4_920_734_208);
    expect(v.breakdown.kvCacheBytes).toBe(1_073_741_824);
    expect(v.breakdown.overheadBytes).toBe(597_456_000);
    expect(v.breakdown.totalBytes).toBe(6_591_932_032);
  });

  it("reports measured confidence when the size came from a real file", () => {
    expect(v.confidence).toBe("measured");
  });
});

describe("evaluate — CPU offloaded", () => {
  const v = evaluate(llama70b, rtx4070, ollama8k);

  it("offloads a 70B that does not fit VRAM but fits VRAM + usable RAM", () => {
    expect(v.status).toBe("cpu-offloaded");
    expect(v.breakdown.totalBytes).toBe(45_781_810_560);
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
    expect(v.breakdown.weightsBytes / GB).toBeCloseTo(141, 0);
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/compat/__tests__/evaluate.test.ts`
Expected: FAIL — `Cannot find module '../evaluate'`.

- [ ] **Step 4: Write `src/lib/compat/evaluate.ts`**

```ts
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
  VerdictStatus,
} from "./types";

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
  if (settings.contextLength > model.arch.maxContext) {
    return wontRun(
      "context",
      `This model supports up to ${model.arch.maxContext.toLocaleString()} tokens.`,
    );
  }

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

  // vLLM and SGLang pre-reserve a fraction of VRAM and carve KV out of it,
  // so the question is not "does the sum fit" but "do weights fit the pool".
  if (engine.preReservesKvPool) {
    const pool = vram * (engine.memoryUtilization ?? 0.9);
    if (weights + overhead <= pool && kv <= pool - weights - overhead) {
      return { ...base, status: "run-on-gpu", notes };
    }
    return {
      ...base,
      status: "wont-run",
      limitingFactor: "vram",
      notes: [
        `${engine.label} reserves ${Math.round((engine.memoryUtilization ?? 0.9) * 100)}% of VRAM up front and cannot offload to system RAM.`,
      ],
    };
  }

  if (total <= vram) return { ...base, status: "run-on-gpu", notes };

  const spillCeiling =
    hw.kind === "apple-silicon" ? hw.ramBytes * APPLE_SOFT_CEILING : vram + usableRam(hw);

  if (engine.supportsCpuOffload && total <= spillCeiling) {
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
```

`bytesPerLayer` divides weights evenly across layers, ignoring embeddings and the output head, which are not per-layer tensors. This is the documented approximation from the spec: close enough for a layer count, and the test above pins it at 16.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/compat/__tests__/evaluate.test.ts`
Expected: 14 tests PASS.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/compat/evaluate.ts src/lib/compat/__tests__/
git commit -m "feat: add evaluate() with GPU, offload, pool-reserving and Apple paths"
```

---

### Task 8: Run-it command templates

**Files:**
- Create: `src/lib/compat/runCommand.ts`
- Test: `src/lib/compat/__tests__/runCommand.test.ts`

**Interfaces:**
- Consumes: `evaluate` (T7), `getEngine` (T5)
- Produces: `runCommand(model: ModelSpec, settings: Settings, verdict: Verdict): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/compat/__tests__/runCommand.test.ts
import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { runCommand } from "../runCommand";
import { llama8b, llama70b, qwen235bMoe, rtx4070 } from "./fixtures";
import type { Settings } from "../types";

const ollama8k: Settings = {
  engine: "ollama",
  contextLength: 8192,
  kvPrecision: "fp16",
  quantId: "Q4_K_M",
};

describe("runCommand", () => {
  it("emits an ollama run line for a model that fits", () => {
    const v = evaluate(llama8b, rtx4070, ollama8k);
    expect(runCommand(llama8b, ollama8k, v)).toBe("ollama run llama-3.1-8b-instruct:Q4_K_M");
  });

  it("passes the verdict's layer count to llama.cpp", () => {
    const s: Settings = { ...ollama8k, engine: "llamacpp" };
    const v = evaluate(llama70b, rtx4070, s);
    const cmd = runCommand(llama70b, s, v);
    expect(cmd).toContain("--n-gpu-layers 16");
    expect(cmd).toContain("-c 8192");
    expect(cmd).toContain("Llama-3.3-70B-Instruct-Q4_K_M.gguf");
  });

  it("emits a vLLM line with the context length as --max-model-len", () => {
    const s: Settings = { ...ollama8k, engine: "vllm", quantId: "AWQ-4bit" };
    const v = evaluate(llama8b, rtx4070, s);
    expect(runCommand(llama8b, s, v)).toContain("--max-model-len 8192");
  });

  it("returns null for a model that will not run", () => {
    const v = evaluate(qwen235bMoe, rtx4070, ollama8k);
    expect(runCommand(qwen235bMoe, ollama8k, v)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/compat/__tests__/runCommand.test.ts`
Expected: FAIL — `Cannot find module '../runCommand'`.

- [ ] **Step 3: Write `src/lib/compat/runCommand.ts`**

```ts
import type { EngineId, ModelSpec, Settings, Verdict } from "./types";

function ollamaTag(model: ModelSpec, quantId: string): string {
  const name = model.displayName.toLowerCase().replace(/\s+/g, "-");
  return `${name}:${quantId}`;
}

function ggufFile(model: ModelSpec, quantId: string): string {
  const quant = model.quants.find((q) => q.id === quantId);
  return quant?.fileName ?? `${model.displayName.replace(/\s+/g, "-")}-${quantId}.gguf`;
}

type Template = (model: ModelSpec, settings: Settings, verdict: Verdict) => string;

const TEMPLATES: Record<EngineId, Template> = {
  ollama: (m, s, v) => `ollama run ${ollamaTag(m, v.quantId ?? s.quantId)}`,
  llamacpp: (m, s, v) =>
    `llama-cli -m ${ggufFile(m, v.quantId ?? s.quantId)} -c ${s.contextLength}` +
    ` --n-gpu-layers ${v.gpuLayers ?? m.arch.numLayers}`,
  koboldcpp: (m, s, v) =>
    `koboldcpp --model ${ggufFile(m, v.quantId ?? s.quantId)}` +
    ` --contextsize ${s.contextLength} --gpulayers ${v.gpuLayers ?? m.arch.numLayers}`,
  vllm: (m, s) =>
    `vllm serve ${m.source.hfRepo} --max-model-len ${s.contextLength}` +
    ` --gpu-memory-utilization 0.9`,
  tgi: (m, s) =>
    `text-generation-launcher --model-id ${m.source.hfRepo}` +
    ` --max-total-tokens ${s.contextLength}`,
  sglang: (m, s) =>
    `python -m sglang.launch_server --model-path ${m.source.hfRepo}` +
    ` --context-length ${s.contextLength}`,
};

/** Returns null when there is nothing to run — a verdict of won't-run. */
export function runCommand(
  model: ModelSpec,
  settings: Settings,
  verdict: Verdict,
): string | null {
  if (verdict.status === "wont-run") return null;
  return TEMPLATES[settings.engine](model, settings, verdict);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/compat/__tests__/runCommand.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compat/runCommand.ts src/lib/compat/__tests__/runCommand.test.ts
git commit -m "feat: add per-engine run command templates"
```

---

### Task 9: Seed data files and their validation gate

**Files:**
- Create: `data/models.json`, `data/gpus.json`, `data/laptops.json`, `config/families.json`, `config/benchmarks.json`
- Test: `src/lib/data/__tests__/dataFiles.test.ts`

**Interfaces:**
- Consumes: `modelsFileSchema`, `gpusFileSchema`, `laptopsFileSchema` (T2)
- Produces: validated seed data. Plan 3's ingestion pipeline overwrites `data/models.json`; this test is the gate that stops it committing malformed output.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/data/__tests__/dataFiles.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gpusFileSchema, laptopsFileSchema, modelsFileSchema } from "../schema";

const load = (p: string) => JSON.parse(readFileSync(p, "utf8"));

describe("shipped data files", () => {
  it("validates data/models.json", () => {
    const r = modelsFileSchema.safeParse(load("data/models.json"));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues, null, 2)).toBe(true);
  });

  it("validates data/gpus.json", () => {
    const r = gpusFileSchema.safeParse(load("data/gpus.json"));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues, null, 2)).toBe(true);
  });

  it("validates data/laptops.json", () => {
    const r = laptopsFileSchema.safeParse(load("data/laptops.json"));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues, null, 2)).toBe(true);
  });

  it("gives every laptop a gpuId that exists, or null", () => {
    const gpus = new Set(load("data/gpus.json").gpus.map((g: { id: string }) => g.id));
    for (const l of load("data/laptops.json").laptops) {
      if (l.gpuId !== null) expect(gpus.has(l.gpuId), `unknown gpuId: ${l.gpuId}`).toBe(true);
    }
  });

  it("gives every model at least one quantisation", () => {
    for (const m of load("data/models.json").models) {
      expect(m.quants.length, `${m.id} has no quants`).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/data/__tests__/dataFiles.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open 'data/models.json'`.

- [ ] **Step 3: Create `data/gpus.json`**

Seed with cards that span the VRAM tiers the reference sites organise around (8/12/16/24/32 GB+). Twelve entries is enough to exercise lookup; Plan 2 extends the list.

```json
{
  "schemaVersion": 1,
  "gpus": [
    { "id": "rtx-3060-12", "name": "NVIDIA GeForce RTX 3060 12GB", "vendor": "nvidia", "vramBytes": 12000000000, "memBandwidthGBs": 360 },
    { "id": "rtx-3080-10", "name": "NVIDIA GeForce RTX 3080", "vendor": "nvidia", "vramBytes": 10000000000, "memBandwidthGBs": 760 },
    { "id": "rtx-3090", "name": "NVIDIA GeForce RTX 3090", "vendor": "nvidia", "vramBytes": 24000000000, "memBandwidthGBs": 936 },
    { "id": "rtx-4060-ti-8", "name": "NVIDIA GeForce RTX 4060 Ti 8GB", "vendor": "nvidia", "vramBytes": 8000000000, "memBandwidthGBs": 288 },
    { "id": "rtx-4070", "name": "NVIDIA GeForce RTX 4070", "vendor": "nvidia", "vramBytes": 12000000000, "memBandwidthGBs": 504 },
    { "id": "rtx-4080", "name": "NVIDIA GeForce RTX 4080", "vendor": "nvidia", "vramBytes": 16000000000, "memBandwidthGBs": 717 },
    { "id": "rtx-4090", "name": "NVIDIA GeForce RTX 4090", "vendor": "nvidia", "vramBytes": 24000000000, "memBandwidthGBs": 1008 },
    { "id": "rtx-5090", "name": "NVIDIA GeForce RTX 5090", "vendor": "nvidia", "vramBytes": 32000000000, "memBandwidthGBs": 1792 },
    { "id": "rx-7900-xtx", "name": "AMD Radeon RX 7900 XTX", "vendor": "amd", "vramBytes": 24000000000, "memBandwidthGBs": 960 },
    { "id": "arc-a770-16", "name": "Intel Arc A770 16GB", "vendor": "intel", "vramBytes": 16000000000, "memBandwidthGBs": 560 },
    { "id": "apple-m3-max", "name": "Apple M3 Max", "vendor": "apple", "vramBytes": 0, "memBandwidthGBs": 400 },
    { "id": "apple-m4-pro", "name": "Apple M4 Pro", "vendor": "apple", "vramBytes": 0, "memBandwidthGBs": 273 }
  ]
}
```

- [ ] **Step 4: Create `data/laptops.json`**

```json
{
  "schemaVersion": 1,
  "laptops": [
    { "id": "macbook-pro-16-m3-max-64", "name": "MacBook Pro 16\" M3 Max (64GB)", "kind": "apple-silicon", "gpuId": "apple-m3-max", "vramBytes": 0, "ramBytes": 64000000000, "ramType": "unified" },
    { "id": "macbook-pro-14-m4-pro-24", "name": "MacBook Pro 14\" M4 Pro (24GB)", "kind": "apple-silicon", "gpuId": "apple-m4-pro", "vramBytes": 0, "ramBytes": 24000000000, "ramType": "unified" },
    { "id": "legion-pro-7i-4090", "name": "Lenovo Legion Pro 7i (RTX 4090 laptop)", "kind": "discrete-gpu", "gpuId": "rtx-4090", "vramBytes": 16000000000, "ramBytes": 32000000000, "ramType": "DDR5" },
    { "id": "rog-zephyrus-g14-4060", "name": "ASUS ROG Zephyrus G14 (RTX 4060)", "kind": "discrete-gpu", "gpuId": "rtx-4060-ti-8", "vramBytes": 8000000000, "ramBytes": 16000000000, "ramType": "LPDDR5X" },
    { "id": "framework-16-7700s", "name": "Framework Laptop 16", "kind": "discrete-gpu", "gpuId": null, "vramBytes": 8000000000, "ramBytes": 32000000000, "ramType": "DDR5" }
  ]
}
```

Note the Legion entry: a laptop RTX 4090 ships 16 GB, not the desktop card's 24 GB. `vramBytes` on the laptop entry is authoritative and overrides the GPU table — which is exactly why laptops carry their own VRAM figure.

- [ ] **Step 5: Create `data/models.json`**

Seed with the three fixture models so the engine's golden anchors and the shipped data agree. Copy the three objects verbatim from `src/lib/compat/__tests__/fixtures.ts`, wrapped as `{ "schemaVersion": 1, "models": [ ... ] }`, converting the TypeScript numeric separators (`8_030_000_000`) to plain JSON numbers (`8030000000`).

- [ ] **Step 6: Create `config/families.json`**

```json
{
  "families": [
    { "name": "Llama 3.1", "hfOrg": "meta-llama", "repos": ["Llama-3.1-8B-Instruct", "Llama-3.1-70B-Instruct"], "categories": ["chat"] },
    { "name": "Llama 3.3", "hfOrg": "meta-llama", "repos": ["Llama-3.3-70B-Instruct"], "categories": ["chat", "reasoning"] },
    { "name": "Qwen3", "hfOrg": "Qwen", "repos": ["Qwen3-235B-A22B"], "categories": ["reasoning"] }
  ]
}
```

- [ ] **Step 7: Create `config/benchmarks.json`**

Scores are hand-curated, never scraped — each entry records where its number came from, because published scores use inconsistent eval harnesses.

```json
{
  "scores": {
    "meta-llama/Llama-3.1-8B-Instruct": { "mmlu": 69.4, "_source": "Meta Llama 3.1 model card" },
    "meta-llama/Llama-3.3-70B-Instruct": { "mmlu": 86.0, "_source": "Meta Llama 3.3 model card" },
    "Qwen/Qwen3-235B-A22B": { "mmlu": null, "_source": "not reported" }
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/__tests__/dataFiles.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 9: Run the whole suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add data/ config/ src/lib/data/__tests__/dataFiles.test.ts
git commit -m "feat: add seed data files with schema validation gate"
```

---

### Task 10: Public module surface

**Files:**
- Create: `src/lib/compat/index.ts`
- Test: `src/lib/compat/__tests__/purity.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–8
- Produces: the single import path Plan 2's UI uses — `import { evaluate, runCommand, ENGINES } from "@/lib/compat"`

- [ ] **Step 1: Write the failing test**

The purity test is the one that protects the architecture over time. It reads the module's own source, so it catches a stray `fetch` or React import that no behavioural test would.

```ts
// src/lib/compat/__tests__/purity.test.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as compat from "../index";

const DIR = "src/lib/compat";

const sourceFiles = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ name: f, text: readFileSync(join(DIR, f), "utf8") }));

describe("compat module surface", () => {
  it("exports the functions the UI needs", () => {
    expect(typeof compat.evaluate).toBe("function");
    expect(typeof compat.runCommand).toBe("function");
    expect(typeof compat.kvCacheBytes).toBe("function");
    expect(typeof compat.weightBytes).toBe("function");
    expect(compat.ENGINES).toBeDefined();
    expect(compat.GB).toBe(1_000_000_000);
  });
});

describe("compat module purity", () => {
  it("imports nothing from React, the DOM or the filesystem", () => {
    for (const { name, text } of sourceFiles) {
      expect(text, `${name} imports react`).not.toMatch(/from ["']react/);
      expect(text, `${name} uses fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(text, `${name} imports node:fs`).not.toMatch(/node:fs/);
      expect(text, `${name} reads the clock`).not.toMatch(/Date\.now|new Date\(\)/);
    }
  });

  it("is deterministic — same inputs, same output", async () => {
    const { llama8b, rtx4070 } = await import("./fixtures");
    const s = { engine: "ollama", contextLength: 8192, kvPrecision: "fp16", quantId: "Q4_K_M" } as const;
    expect(compat.evaluate(llama8b, rtx4070, s)).toEqual(compat.evaluate(llama8b, rtx4070, s));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/compat/__tests__/purity.test.ts`
Expected: FAIL — `Cannot find module '../index'`.

- [ ] **Step 3: Write `src/lib/compat/index.ts`**

```ts
export * from "./types";
export { GGUF_BPW, NON_GGUF_BPW, bitsPerWeight, weightBytes } from "./quant";
export { KV_BYTES_PER_ELEMENT, kvCacheBytes } from "./kvCache";
export { ENGINES, getEngine, overheadBytes } from "./engines";
export type { EngineProfile } from "./engines";
export {
  GB,
  RAM_RESERVE_FRACTION,
  RAM_RESERVE_FLOOR,
  APPLE_WIRED_FRACTION,
  APPLE_SOFT_CEILING,
  usableRam,
  usableVram,
} from "./memory";
export { evaluate, selectQuant } from "./evaluate";
export { runCommand } from "./runCommand";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/compat/__tests__/purity.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compat/index.ts src/lib/compat/__tests__/purity.test.ts
git commit -m "feat: add compat module public surface with a purity guard"
```

---

## Done when

- `npm test` passes: roughly 50 tests across schemas, quantisation, KV cache, engines, memory, evaluate, run commands, data files and purity.
- `npm run build` typechecks and builds.
- `evaluate()` reproduces all three golden anchors exactly: 6,591,932,032 bytes (run on GPU), 45,781,810,560 bytes with 16 GPU layers (offloaded), ~141 GB (won't run).
- The purity test passes, so `src/lib/compat/` is safe for Plan 2's UI to import anywhere.

## Notes for whoever executes this

**If a golden number moves, stop.** The three anchors in Task 7 are also printed in `docs/design/style-reference.html`. Changing an overhead constant to make a test pass means that page now lies. Change the constant deliberately, update both, and say so in the commit.

**The overhead constants are the soft spot.** `GGUF_OVERHEAD` and `SERVER_OVERHEAD` in Task 5 are estimates calibrated so the 8B anchor lands at 0.60 GB. They are the first thing to tune against real-world reports, and the golden tests exist to show what else moves when you do.
