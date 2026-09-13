# Ingestion Pipeline and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-written `data/models.json` with a pipeline that builds it from Hugging Face, validated against the app's own schema, run on a schedule by GitHub Actions and committed only when the output actually changes.

**Architecture:** `scripts/ingest/` is a set of small pure modules plus one thin `main.ts` that does the I/O. Each module takes data and returns data, so every rule — how `head_dim` is derived, how split GGUF parts are summed, which quantisations are admitted — is unit-testable without a network. The network layer is one file with two functions.

**Tech Stack:** TypeScript run through `vite-node` (already present via vitest — **no new dependency**), zod for validation, vitest for tests, GitHub Actions for the cron.

**Spec:** [`docs/superpowers/specs/2026-09-12-llm-hardware-compatibility-checker-design.md`](../specs/2026-09-12-llm-hardware-compatibility-checker-design.md) — §4 data model, §6 ingestion and CI, §12 risks.

## Global Constraints

- **Bytes internally, decimal GB at the edges.** `1 GB = 1_000_000_000`. Never GiB.
- **`src/lib/compat/` stays pure.** No React, `fetch`, `node:fs`, `Date.now()`, `toLocaleString`, `Math.random`, `performance.now`, `Intl.`, `process.`, `window.`, `localStorage`. `purity.test.ts` scans source text **including comments** — a comment mentioning a banned token fails the suite. **Ingestion code lives in `scripts/`, never in `src/lib/compat/`.** Importing `src/lib/compat/quant.ts` from `scripts/` is fine; editing it to mention `fetch` is not.
- **Three golden anchors must not move:** `6_591_932_032` (Llama 3.1 8B total), `45_781_810_560` (Llama 3.3 70B total), `gpuLayers` = 16. They are also printed in `docs/design/style-reference.html` — if one moves, that page is wrong too.
- **Benchmark scores are hand-curated, never fetched** (spec §6). Ingestion *merges* `config/benchmarks.json`; it never derives a score.
- **Fail loudly, write nothing** (spec §12). A missing or unparseable upstream field aborts the run. A partially-correct `data/models.json` is worse than a stale one.
- **`schemaVersion` stays `1`.** Every change in this plan is additive.
- Run the suite with `npm test -- --run`. Build with `npm run build`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/compat/types.ts` (modify) | `Verdict.breakdown` becomes nullable |
| `src/lib/data/schema.ts` (modify) | `source.archRepo`; new `familiesFileSchema` |
| `config/families.json` (modify) | gains `archRepo`, `ggufRepo`, `activeParams` per repo |
| `scripts/ingest/hfClient.ts` | the only file that touches the network |
| `scripts/ingest/architecture.ts` | `config.json` → `ModelSpec["arch"]`, with the `head_dim` fallback |
| `scripts/ingest/quants.ts` | GGUF file lists → measured quants; bits-per-weight fill for the rest |
| `scripts/ingest/assemble.ts` | pure: all the pieces → one `ModelSpec` |
| `scripts/ingest/diff.ts` | keeps `fetchedAt` stable when nothing else moved |
| `scripts/ingest/main.ts` | I/O: read config, call the network, validate, write |
| `.github/workflows/refresh-data.yml` | the cron |

---

## Task 1: A verdict says when it has no breakdown

Carried out of Plan 2 and scheduled here deliberately: every new early-return guard in `evaluate()` must currently remember to zero the breakdown, or `QuantTable` misreports. Ingestion is about to push many more models through those guards, so this lands first.

**Files:**
- Modify: `src/lib/compat/types.ts`
- Modify: `src/lib/compat/evaluate.ts`
- Modify: `src/features/report/QuantTable.tsx`
- Modify: `src/features/results/sort.ts`
- Test: `src/lib/compat/__tests__/evaluate.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Verdict.breakdown: Breakdown | null`. Every consumer must null-check. `sortRows` treats a null breakdown as `Infinity` bytes, so an unevaluable model sorts last instead of sorting as though it needed nothing.

- [ ] **Step 1: Write the failing test**

In `src/lib/compat/__tests__/evaluate.test.ts`:

```ts
it("returns a null breakdown when it never computed one", () => {
  // vLLM cannot run on Apple Silicon: the engine guard returns before any
  // memory arithmetic happens. "No breakdown" is a fact the verdict should
  // state, not something the UI infers from an all-zero object.
  const verdict = evaluate(MODEL_8B, APPLE_HW, { ...REFERENCE_SETTINGS, engine: "vllm" });
  expect(verdict.status).toBe("wont-run");
  expect(verdict.breakdown).toBeNull();
});

it("still returns a breakdown when it did the arithmetic", () => {
  const verdict = evaluate(MODEL_8B, REFERENCE_HW, REFERENCE_SETTINGS);
  expect(verdict.breakdown).not.toBeNull();
  expect(verdict.breakdown!.totalBytes).toBe(6_591_932_032);
});
```

If `APPLE_HW` does not already exist in `src/features/results/__tests__/fixtures.ts`, add it beside the others:

```ts
export const APPLE_HW: HardwareSpec = {
  kind: "apple-silicon",
  vramBytes: 24 * GB,
  ramBytes: 24 * GB,
  ramType: "unified",
};
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/compat/__tests__/evaluate.test.ts -t "null breakdown"`
Expected: FAIL — `expected { weightsBytes: 0, … } to be null`.

- [ ] **Step 3: Make the type nullable and return null from every guard**

In `src/lib/compat/types.ts`:

```ts
  breakdown: Breakdown | null;
```

In `src/lib/compat/evaluate.ts`, find every early return that builds an all-zero breakdown and return `null` there instead. Do not touch any return that reflects real arithmetic.

- [ ] **Step 4: Fix the consumers the compiler now rejects**

Run `npx tsc --noEmit` and fix each error. Two are known.

`src/features/report/QuantTable.tsx` — replace the shape-inference with the stated fact:

```tsx
// Was: v.status === "wont-run" && v.breakdown.totalBytes === 0
{v.breakdown === null ? "—" : formatGB(v.breakdown.totalBytes)}
```

`src/features/results/sort.ts` — a model the engine could not evaluate has no size to sort by:

```ts
const totalOf = (r: ScoredModel) => r.verdict.breakdown?.totalBytes ?? Infinity;
```

Use `totalOf` in both the `"size"` case and the `"compatibility"` tiebreak.

- [ ] **Step 5: Run the full suite**

Run: `npm test -- --run`
Expected: PASS, every file. Fix the consumer rather than loosening a test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compat src/features/report src/features/results
git commit -m "refactor: a verdict states when it has no breakdown"
```

---

## Task 2: families.json learns where to read from

`meta-llama` repos are `gated: "manual"`. Verified live: `config.json` returns **401** anonymously, and the metadata API — which does answer 200 — carries only `architectures` and `model_type`, none of the four fields the engine needs. Architecture is therefore read from an ungated mirror, and the data records which one.

**Files:**
- Modify: `config/families.json`
- Modify: `src/lib/data/schema.ts`
- Test: `src/lib/data/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `familiesFileSchema`, and `modelSchema.source.archRepo?: string`. A repo entry is `{ name: string; archRepo?: string; ggufRepo?: string; activeParams?: number }`.

- [ ] **Step 1: Write the failing test**

In `src/lib/data/__tests__/schema.test.ts`:

```ts
import familiesJson from "../../../../config/families.json";
import { familiesFileSchema } from "../schema";

describe("familiesFileSchema", () => {
  it("accepts the tracked families as written", () => {
    expect(() => familiesFileSchema.parse(familiesJson)).not.toThrow();
  });

  it("requires an archRepo for a gated org, because config.json 401s there", () => {
    const gated = {
      families: [
        { name: "Llama 3.1", hfOrg: "meta-llama", categories: ["chat"],
          repos: [{ name: "Llama-3.1-8B-Instruct" }] },
      ],
    };
    expect(() => familiesFileSchema.parse(gated)).toThrow(/archRepo/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/__tests__/schema.test.ts -t families`
Expected: FAIL — `familiesFileSchema is not exported`.

- [ ] **Step 3: Add the schema**

Append to `src/lib/data/schema.ts`:

```ts
/**
 * Orgs whose repos are gated on Hugging Face: config.json returns 401 without
 * an accepted licence, so an ungated mirror must be named explicitly. Listed
 * rather than detected, so a missing archRepo fails at config-load time
 * instead of at 4am in CI.
 */
export const GATED_ORGS = ["meta-llama"] as const;

const repoEntrySchema = z.object({
  name: z.string().min(1),
  archRepo: z.string().min(1).optional(),
  ggufRepo: z.string().min(1).optional(),
  /** MoE only. Hand-declared: deriving active params from config.json needs
   *  expert-layer arithmetic that differs per architecture, so it is curated
   *  like a benchmark score rather than guessed. */
  activeParams: z.number().positive().optional(),
});

const familyEntrySchema = z
  .object({
    name: z.string().min(1),
    hfOrg: z.string().min(1),
    categories: z
      .array(z.enum(["chat", "code", "reasoning", "vision", "embedding", "medical", "finance", "legal"]))
      .min(1),
    repos: z.array(repoEntrySchema).min(1),
  })
  .refine(
    (f) => !(GATED_ORGS as readonly string[]).includes(f.hfOrg) || f.repos.every((r) => r.archRepo),
    { message: "a gated org needs an archRepo on every repo", path: ["repos"] },
  );

export const familiesFileSchema = z.object({ families: z.array(familyEntrySchema).min(1) });
```

In the same file, add `archRepo` to the model's source block:

```ts
  source: z.object({
    hfRepo: z.string().min(1),
    archRepo: z.string().min(1).optional(),
    ggufRepo: z.string().optional(),
    fetchedAt: z.string().min(1),
  }),
```

- [ ] **Step 4: Rewrite config/families.json**

```json
{
  "families": [
    {
      "name": "Llama 3.1",
      "hfOrg": "meta-llama",
      "categories": ["chat"],
      "repos": [
        { "name": "Llama-3.1-8B-Instruct",
          "archRepo": "unsloth/Meta-Llama-3.1-8B-Instruct",
          "ggufRepo": "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF" }
      ]
    },
    {
      "name": "Llama 3.3",
      "hfOrg": "meta-llama",
      "categories": ["chat", "reasoning"],
      "repos": [
        { "name": "Llama-3.3-70B-Instruct",
          "archRepo": "unsloth/Llama-3.3-70B-Instruct",
          "ggufRepo": "bartowski/Llama-3.3-70B-Instruct-GGUF" }
      ]
    },
    {
      "name": "Qwen3",
      "hfOrg": "Qwen",
      "categories": ["reasoning"],
      "repos": [
        { "name": "Qwen3-235B-A22B", "activeParams": 22000000000 }
      ]
    }
  ]
}
```

`Llama-3.1-70B-Instruct` is dropped from the tracked list: it has no curated benchmark entry and no verified mirror. Adding models back is a config edit, which is the point of this plan.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/data`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add config/families.json src/lib/data
git commit -m "feat: families.json names an arch mirror for gated orgs"
```

---

## Task 3: the network layer

One file, one job, so everything downstream is pure and testable offline.

**Files:**
- Create: `scripts/ingest/hfClient.ts`
- Test: `scripts/ingest/__tests__/hfClient.test.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `fetchModelInfo(repo: string): Promise<HfModelInfo>` — `GET https://huggingface.co/api/models/{repo}?blobs=true`
  - `fetchConfigJson(repo: string): Promise<Record<string, unknown>>` — `GET https://huggingface.co/{repo}/resolve/main/config.json`
  - `interface HfModelInfo { id: string; gated: false | string; safetensors?: { total: number }; siblings: { rfilename: string; size?: number }[] }`
  - `class IngestError extends Error`

- [ ] **Step 1: Widen the test glob**

`vite.config.ts` currently restricts tests to `src/**`. Change `test.include` to:

```ts
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
```

- [ ] **Step 2: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { IngestError, fetchConfigJson, fetchModelInfo } from "../hfClient";

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

describe("fetchModelInfo", () => {
  it("asks for blobs, because file sizes are absent without them", async () => {
    const fetchMock = ok({ id: "x/y", gated: false, siblings: [] });
    vi.stubGlobal("fetch", fetchMock);
    await fetchModelInfo("x/y");
    expect(fetchMock.mock.calls[0][0]).toBe("https://huggingface.co/api/models/x/y?blobs=true");
  });

  it("names the repo and status when the API refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(fetchModelInfo("x/y")).rejects.toThrow(/x\/y.*404/s);
  });
});

describe("fetchConfigJson", () => {
  it("reads config.json from the resolve endpoint", async () => {
    const fetchMock = ok({ num_hidden_layers: 32 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchConfigJson("a/b")).resolves.toEqual({ num_hidden_layers: 32 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://huggingface.co/a/b/resolve/main/config.json");
  });

  it("fails loudly on a gated 401 rather than returning an empty object", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    await expect(fetchConfigJson("meta-llama/x")).rejects.toThrow(IngestError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/__tests__/hfClient.test.ts`
Expected: FAIL — cannot resolve `../hfClient`.

- [ ] **Step 4: Write the client**

```ts
export class IngestError extends Error {}

const API = "https://huggingface.co/api/models";

async function getJson(url: string, what: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new IngestError(`${what}: ${url} returned ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface HfModelInfo {
  id: string;
  gated: false | string;
  safetensors?: { total: number };
  siblings: { rfilename: string; size?: number }[];
}

/** blobs=true is what puts `size` on each sibling; without it every file
 *  reports undefined and every quantisation falls back to an estimate. */
export async function fetchModelInfo(repo: string): Promise<HfModelInfo> {
  const raw = (await getJson(`${API}/${repo}?blobs=true`, repo)) as Partial<HfModelInfo>;
  return {
    id: raw.id ?? repo,
    gated: raw.gated ?? false,
    safetensors: raw.safetensors,
    siblings: raw.siblings ?? [],
  };
}

export async function fetchConfigJson(repo: string): Promise<Record<string, unknown>> {
  return (await getJson(
    `https://huggingface.co/${repo}/resolve/main/config.json`,
    `${repo} config.json`,
  )) as Record<string, unknown>;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run scripts/ingest`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts scripts/ingest
git commit -m "feat: hugging face client for ingestion"
```

---

## Task 4: architecture, including the field that is often missing

Spec §12 predicted this and it is real: `NousResearch/Meta-Llama-3.1-8B-Instruct` omits `head_dim` while `unsloth/Meta-Llama-3.1-8B-Instruct` states it as 128. The fallback `hidden_size / num_attention_heads` = 4096/32 = 128 agrees.

**Files:**
- Create: `scripts/ingest/architecture.ts`
- Test: `scripts/ingest/__tests__/architecture.test.ts`

**Interfaces:**
- Consumes: a plain object, as returned by `fetchConfigJson`
- Produces: `readArchitecture(config: Record<string, unknown>, repo: string): { numLayers: number; numKvHeads: number; headDim: number; maxContext: number }`, throwing `IngestError` on anything missing or non-integral.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { readArchitecture } from "../architecture";
import { IngestError } from "../hfClient";

const LLAMA_31_8B = {
  num_hidden_layers: 32, num_key_value_heads: 8, head_dim: 128,
  max_position_embeddings: 131072, hidden_size: 4096, num_attention_heads: 32,
};

describe("readArchitecture", () => {
  it("reads the four fields the engine needs", () => {
    expect(readArchitecture(LLAMA_31_8B, "x/y")).toEqual({
      numLayers: 32, numKvHeads: 8, headDim: 128, maxContext: 131072,
    });
  });

  it("derives head_dim when the mirror omits it", () => {
    const { head_dim, ...without } = LLAMA_31_8B;
    // 4096 / 32 = 128 — the value the other mirror states outright.
    expect(readArchitecture(without, "x/y").headDim).toBe(128);
  });

  it("refuses to guess when neither head_dim nor its ingredients are present", () => {
    const { head_dim, hidden_size, ...crippled } = LLAMA_31_8B;
    expect(() => readArchitecture(crippled, "x/y")).toThrow(IngestError);
  });

  it("names the repo and the field when something is missing", () => {
    const { num_key_value_heads, ...crippled } = LLAMA_31_8B;
    expect(() => readArchitecture(crippled, "meta-llama/Thing")).toThrow(
      /meta-llama\/Thing.*num_key_value_heads/s,
    );
  });

  it("rejects a non-integer layer count instead of rounding it", () => {
    expect(() => readArchitecture({ ...LLAMA_31_8B, num_hidden_layers: 31.5 }, "x/y")).toThrow(IngestError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/__tests__/architecture.test.ts`
Expected: FAIL — cannot resolve `../architecture`.

- [ ] **Step 3: Write the module**

```ts
import { IngestError } from "./hfClient";

function positiveInt(config: Record<string, unknown>, field: string, repo: string): number {
  const value = config[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new IngestError(
      `${repo}: config.json field ${field} is ${JSON.stringify(value)}, expected a positive integer`,
    );
  }
  return value;
}

/**
 * Fails loudly rather than defaulting (spec §12). A model whose architecture
 * cannot be read is a model that cannot be scored, and a plausible-looking
 * guess would produce a confident wrong answer — the one outcome this
 * product exists to avoid.
 */
export function readArchitecture(config: Record<string, unknown>, repo: string) {
  const numLayers = positiveInt(config, "num_hidden_layers", repo);
  const numKvHeads = positiveInt(config, "num_key_value_heads", repo);
  const maxContext = positiveInt(config, "max_position_embeddings", repo);

  const headDim =
    typeof config.head_dim === "number"
      ? positiveInt(config, "head_dim", repo)
      : positiveInt(config, "hidden_size", repo) / positiveInt(config, "num_attention_heads", repo);

  if (!Number.isInteger(headDim)) {
    throw new IngestError(`${repo}: derived head_dim ${headDim} is not an integer`);
  }

  return { numLayers, numKvHeads, headDim, maxContext };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/ingest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest
git commit -m "feat: read model architecture, deriving head_dim when absent"
```

---

## Task 5: quantisations, and the split-file trap

**This is the task that can produce a wrong answer.** Verified on `bartowski/Llama-3.3-70B-Instruct-GGUF`: `Q6_K` is two files, 39,953,848,064 and 17,934,300,608 bytes. Read only the first and Runcheck records 39.95 GB for a quantisation that needs 57.89 GB — and tells someone with a 48 GB card that it fits.

**Files:**
- Create: `scripts/ingest/quants.ts`
- Test: `scripts/ingest/__tests__/quants.test.ts`

**Interfaces:**
- Consumes: `HfModelInfo["siblings"]` (Task 3); `GGUF_BPW` from `src/lib/compat/quant.ts`
- Produces:
  - `measuredQuants(siblings: { rfilename: string; size?: number }[]): QuantOption[]`
  - `withEstimates(measured: QuantOption[], totalParams: number): QuantOption[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { GGUF_BPW } from "../../../src/lib/compat/quant";
import { measuredQuants, withEstimates } from "../quants";

const f = (rfilename: string, size: number) => ({ rfilename, size });

describe("measuredQuants", () => {
  it("reads a single-file quantisation at its real size", () => {
    const [q] = measuredQuants([f("Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf", 4_920_734_368)]);
    expect(q).toEqual({
      id: "Q4_K_M", format: "gguf", sizeBytes: 4_920_734_368,
      sizeSource: "measured", fileName: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    });
  });

  it("sums a split quantisation, because one part is not the model", () => {
    // Real sizes from bartowski/Llama-3.3-70B-Instruct-GGUF. Taking the first
    // part alone would claim 39.95 GB for something that needs 57.89 GB.
    const parts = [
      f("Llama-3.3-70B-Instruct-Q6_K/Llama-3.3-70B-Instruct-Q6_K-00001-of-00002.gguf", 39_953_848_064),
      f("Llama-3.3-70B-Instruct-Q6_K/Llama-3.3-70B-Instruct-Q6_K-00002-of-00002.gguf", 17_934_300_608),
    ];
    const [q] = measuredQuants(parts);
    expect(q.id).toBe("Q6_K");
    expect(q.sizeBytes).toBe(57_888_148_672);
  });

  it("ignores quantisations the engine cannot price", () => {
    // Q5_K_L and IQ1_M are real files in that repo but are absent from
    // GGUF_BPW, so nothing could size them when a file is missing.
    const ids = measuredQuants([
      f("x-Q5_K_L.gguf", 1), f("x-IQ1_M.gguf", 2), f("x-Q4_K_M.gguf", 3),
    ]).map((q) => q.id);
    expect(ids).toEqual(["Q4_K_M"]);
  });

  it("skips a file whose size the API did not report", () => {
    expect(measuredQuants([{ rfilename: "x-Q4_K_M.gguf" }])).toEqual([]);
  });

  it("drops an incomplete split rather than under-reporting it", () => {
    const half = [f("x-Q6_K/x-Q6_K-00001-of-00002.gguf", 39_953_848_064)];
    expect(measuredQuants(half)).toEqual([]);
  });

  it("ignores non-gguf files entirely", () => {
    expect(measuredQuants([f("model-00001-of-00004.safetensors", 5), f("README.md", 6)])).toEqual([]);
  });
});

describe("withEstimates", () => {
  it("fills unmeasured quantisations from bits-per-weight", () => {
    const measured = measuredQuants([f("x-Q4_K_M.gguf", 4_920_734_368)]);
    const q8 = withEstimates(measured, 8_030_261_248).find((q) => q.id === "Q8_0")!;
    expect(q8.sizeSource).toBe("estimated");
    expect(q8.fileName).toBeUndefined();
    expect(q8.sizeBytes).toBe((8_030_261_248 * GGUF_BPW.Q8_0) / 8);
  });

  it("never overwrites a measured size with an estimate", () => {
    const measured = measuredQuants([f("x-Q4_K_M.gguf", 4_920_734_368)]);
    const q4 = withEstimates(measured, 8_030_261_248).find((q) => q.id === "Q4_K_M")!;
    expect(q4.sizeSource).toBe("measured");
    expect(q4.sizeBytes).toBe(4_920_734_368);
  });

  it("offers every priceable quantisation exactly once", () => {
    const ids = withEstimates([], 8_030_261_248).map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(Object.keys(GGUF_BPW));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/__tests__/quants.test.ts`
Expected: FAIL — cannot resolve `../quants`.

- [ ] **Step 3: Write the module**

```ts
import { GGUF_BPW } from "../../src/lib/compat/quant";
import type { QuantOption } from "../../src/lib/compat/types";

/** "…-Q6_K-00001-of-00002.gguf" → part 1 of 2. */
const SPLIT = /-(\d{5})-of-(\d{5})\.gguf$/;

/** Quantisation id from a bartowski-style filename: the trailing segment that
 *  the bits-per-weight table recognises. Longest match first, so "Q4_K_M"
 *  wins over any shorter id that is also a suffix. */
function quantIdOf(fileName: string): string | null {
  const base = fileName.split("/").pop()!.replace(SPLIT, "").replace(/\.gguf$/, "");
  return (
    Object.keys(GGUF_BPW)
      .slice()
      .sort((a, b) => b.length - a.length)
      .find((id) => base.toUpperCase().endsWith(`-${id.toUpperCase()}`)) ?? null
  );
}

/**
 * Real file sizes, with split quantisations summed. A split whose parts are
 * not all present is dropped: an under-reported size is worse than an
 * estimate, because it arrives wearing a "measured" badge.
 */
export function measuredQuants(siblings: { rfilename: string; size?: number }[]): QuantOption[] {
  const groups = new Map<string, { bytes: number; parts: number; expected: number; fileName: string }>();

  for (const { rfilename, size } of siblings) {
    if (!rfilename.endsWith(".gguf") || typeof size !== "number") continue;
    const id = quantIdOf(rfilename);
    if (id === null) continue;

    const split = SPLIT.exec(rfilename);
    const expected = split ? Number(split[2]) : 1;
    const prev = groups.get(id) ?? { bytes: 0, parts: 0, expected, fileName: rfilename };
    groups.set(id, {
      bytes: prev.bytes + size,
      parts: prev.parts + 1,
      expected,
      fileName: prev.fileName,
    });
  }

  return [...groups.entries()]
    .filter(([, g]) => g.parts === g.expected)
    .map(([id, g]) => ({
      id,
      format: "gguf" as const,
      sizeBytes: g.bytes,
      sizeSource: "measured" as const,
      fileName: g.fileName,
    }));
}

/** Every priceable quantisation: measured where a file exists, priced from
 *  bits-per-weight where it does not. Order follows GGUF_BPW, so the quant
 *  control reads high precision to low. */
export function withEstimates(measured: QuantOption[], totalParams: number): QuantOption[] {
  const byId = new Map(measured.map((q) => [q.id, q]));
  return Object.entries(GGUF_BPW).map(
    ([id, bpw]) =>
      byId.get(id) ?? {
        id,
        format: "gguf" as const,
        sizeBytes: (totalParams * bpw) / 8,
        sizeSource: "estimated" as const,
      },
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/ingest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest
git commit -m "feat: measured quant sizes, with split files summed"
```

---

## Task 6: assemble one model

Pure: everything fetched plus everything curated in, one `ModelSpec` out.

**Files:**
- Create: `scripts/ingest/assemble.ts`
- Test: `scripts/ingest/__tests__/assemble.test.ts`

**Interfaces:**
- Consumes: `readArchitecture` (Task 4), `measuredQuants`/`withEstimates` (Task 5)
- Produces: `assembleModel(input: AssembleInput): ModelSpec`, where `AssembleInput` is `{ familyName, hfRepo, archRepo?, ggufRepo?, categories, activeParams?, totalParams, config, siblings, benchmarks, fetchedAt }`. `fetchedAt` is **injected as a string**, never read from a clock inside this module, so the function stays pure and testable.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { modelSchema } from "../../../src/lib/data/schema";
import { assembleModel } from "../assemble";

const BASE = {
  familyName: "Llama 3.1",
  hfRepo: "meta-llama/Llama-3.1-8B-Instruct",
  archRepo: "unsloth/Meta-Llama-3.1-8B-Instruct",
  ggufRepo: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
  categories: ["chat"] as const,
  totalParams: 8_030_261_248,
  config: {
    num_hidden_layers: 32, num_key_value_heads: 8, head_dim: 128,
    max_position_embeddings: 131072,
  },
  siblings: [{ rfilename: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf", size: 4_920_734_368 }],
  benchmarks: { mmlu: 69.4 },
  fetchedAt: "2026-09-14T00:00:00.000Z",
};

describe("assembleModel", () => {
  it("produces a model the app's own schema accepts", () => {
    expect(() => modelSchema.parse(assembleModel(BASE))).not.toThrow();
  });

  it("keeps the canonical repo as the id, not the mirror it was read from", () => {
    const m = assembleModel(BASE);
    expect(m.id).toBe("meta-llama/Llama-3.1-8B-Instruct");
    expect(m.source.archRepo).toBe("unsloth/Meta-Llama-3.1-8B-Instruct");
  });

  it("turns the repo name into a display name", () => {
    expect(assembleModel(BASE).displayName).toBe("Llama 3.1 8B Instruct");
  });

  it("marks a dense model's active params null rather than copying total", () => {
    // total drives memory, active drives speed only. Conflating them is the
    // single most likely way to get an MoE verdict wrong (spec §4).
    expect(assembleModel(BASE).params).toEqual({ total: 8_030_261_248, active: null });
  });

  it("carries a declared active-parameter count for MoE", () => {
    expect(assembleModel({ ...BASE, activeParams: 22_000_000_000 }).params.active).toBe(22_000_000_000);
  });

  it("merges curated benchmarks verbatim, nulls included", () => {
    const m = assembleModel({ ...BASE, benchmarks: { mmlu: 69.4, gpqa: null } });
    expect(m.benchmarks).toEqual({ mmlu: 69.4, gpqa: null });
  });

  it("keeps a measured size measured", () => {
    const q4 = assembleModel(BASE).quants.find((q) => q.id === "Q4_K_M")!;
    expect(q4.sizeSource).toBe("measured");
    expect(q4.sizeBytes).toBe(4_920_734_368);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/__tests__/assemble.test.ts`
Expected: FAIL — cannot resolve `../assemble`.

- [ ] **Step 3: Write the module**

```ts
import type { BenchmarkId, Category, ModelSpec } from "../../src/lib/compat/types";
import { readArchitecture } from "./architecture";
import { measuredQuants, withEstimates } from "./quants";

export interface AssembleInput {
  familyName: string;
  hfRepo: string;
  archRepo?: string;
  ggufRepo?: string;
  categories: readonly Category[];
  activeParams?: number;
  totalParams: number;
  config: Record<string, unknown>;
  siblings: { rfilename: string; size?: number }[];
  benchmarks: Partial<Record<BenchmarkId, number | null>>;
  fetchedAt: string;
}

/** "Llama-3.1-8B-Instruct" → "Llama 3.1 8B Instruct". */
function displayNameOf(hfRepo: string): string {
  return hfRepo.split("/").pop()!.replace(/-/g, " ");
}

export function assembleModel(input: AssembleInput): ModelSpec {
  return {
    id: input.hfRepo,
    family: input.familyName,
    displayName: displayNameOf(input.hfRepo),
    params: { total: input.totalParams, active: input.activeParams ?? null },
    arch: readArchitecture(input.config, input.archRepo ?? input.hfRepo),
    quants: withEstimates(measuredQuants(input.siblings), input.totalParams),
    benchmarks: input.benchmarks,
    categories: [...input.categories],
    source: {
      hfRepo: input.hfRepo,
      archRepo: input.archRepo,
      ggufRepo: input.ggufRepo,
      fetchedAt: input.fetchedAt,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/ingest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest
git commit -m "feat: assemble a ModelSpec from fetched and curated parts"
```

---

## Task 7: the runner, and why timestamps must not churn

`fetchedAt` changes on every run. Written naively, `data/models.json` differs every week and CI commits noise forever — burying the real upstream change the commit log exists to make reviewable (spec §6). So a model keeps its previous `fetchedAt` unless something else about it changed.

**Files:**
- Create: `scripts/ingest/diff.ts`
- Create: `scripts/ingest/main.ts`
- Test: `scripts/ingest/__tests__/diff.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: everything above
- Produces: `mergePreservingTimestamps(next: ModelSpec[], previous: ModelSpec[]): ModelSpec[]`, and an `npm run ingest` entry point that exits non-zero on failure.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { ModelSpec } from "../../../src/lib/compat/types";
import { mergePreservingTimestamps } from "../diff";

const model = (over: Partial<ModelSpec> = {}): ModelSpec => ({
  id: "a/b", family: "F", displayName: "B",
  params: { total: 1, active: null },
  arch: { numLayers: 1, numKvHeads: 1, headDim: 1, maxContext: 1 },
  quants: [{ id: "Q4_K_M", format: "gguf", sizeBytes: 1, sizeSource: "estimated" }],
  benchmarks: {}, categories: ["chat"],
  source: { hfRepo: "a/b", fetchedAt: "2026-01-01T00:00:00.000Z" },
  ...over,
});

const restamped = (over: Partial<ModelSpec> = {}) =>
  model({ source: { hfRepo: "a/b", fetchedAt: "2026-09-14T00:00:00.000Z" }, ...over });

describe("mergePreservingTimestamps", () => {
  it("keeps the old timestamp when nothing else changed", () => {
    // Otherwise every scheduled run rewrites the file and the commit log
    // fills with timestamp churn.
    expect(mergePreservingTimestamps([restamped()], [model()])[0].source.fetchedAt)
      .toBe("2026-01-01T00:00:00.000Z");
  });

  it("takes the new timestamp when the data actually moved", () => {
    const next = [restamped({ params: { total: 2, active: null } })];
    expect(mergePreservingTimestamps(next, [model()])[0].source.fetchedAt)
      .toBe("2026-09-14T00:00:00.000Z");
  });

  it("stamps a model that did not exist before", () => {
    expect(mergePreservingTimestamps([model()], [])[0].source.fetchedAt)
      .toBe("2026-01-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/__tests__/diff.test.ts`
Expected: FAIL — cannot resolve `../diff`.

- [ ] **Step 3: Write the diff module**

```ts
import type { ModelSpec } from "../../src/lib/compat/types";

const withoutTimestamp = (m: ModelSpec) =>
  JSON.stringify({ ...m, source: { ...m.source, fetchedAt: "" } });

/**
 * A model keeps the timestamp it already had unless something else about it
 * changed. Without this the scheduled job rewrites data/models.json every
 * run, and the commit log — which exists to make every data change a
 * reviewable diff (spec §6) — fills with timestamp bumps instead.
 */
export function mergePreservingTimestamps(next: ModelSpec[], previous: ModelSpec[]): ModelSpec[] {
  const before = new Map(previous.map((m) => [m.id, m]));
  return next.map((m) => {
    const old = before.get(m.id);
    if (!old || withoutTimestamp(old) !== withoutTimestamp(m)) return m;
    return { ...m, source: { ...m.source, fetchedAt: old.source.fetchedAt } };
  });
}
```

- [ ] **Step 4: Run the diff test to verify it passes**

Run: `npx vitest run scripts/ingest/__tests__/diff.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the runner**

```ts
import { readFileSync, writeFileSync } from "node:fs";
import benchmarksJson from "../../config/benchmarks.json";
import familiesJson from "../../config/families.json";
import type { ModelSpec } from "../../src/lib/compat/types";
import { SCHEMA_VERSION, familiesFileSchema, modelsFileSchema } from "../../src/lib/data/schema";
import { assembleModel } from "./assemble";
import { mergePreservingTimestamps } from "./diff";
import { IngestError, fetchConfigJson, fetchModelInfo } from "./hfClient";

const OUT = new URL("../../data/models.json", import.meta.url);

async function main() {
  const { families } = familiesFileSchema.parse(familiesJson);
  const curated = (benchmarksJson as { scores: Record<string, Record<string, number | null>> }).scores;
  const fetchedAt = new Date().toISOString();
  const built: ModelSpec[] = [];

  for (const family of families) {
    for (const repo of family.repos) {
      const hfRepo = `${family.hfOrg}/${repo.name}`;
      const archRepo = repo.archRepo ?? hfRepo;

      const info = await fetchModelInfo(archRepo);
      const totalParams = info.safetensors?.total;
      if (typeof totalParams !== "number") {
        throw new IngestError(`${archRepo}: the API reports no safetensors parameter count`);
      }

      const siblings = repo.ggufRepo ? (await fetchModelInfo(repo.ggufRepo)).siblings : [];
      const scores: Record<string, number | null> = { ...(curated[hfRepo] ?? {}) };
      delete (scores as Record<string, unknown>)._source;

      const model = assembleModel({
        familyName: family.name,
        hfRepo,
        archRepo: repo.archRepo,
        ggufRepo: repo.ggufRepo,
        categories: family.categories,
        activeParams: repo.activeParams,
        totalParams,
        config: await fetchConfigJson(archRepo),
        siblings,
        benchmarks: scores,
        fetchedAt,
      });
      built.push(model);
      const measured = model.quants.filter((q) => q.sizeSource === "measured").length;
      console.log(`ok ${hfRepo} — ${measured} measured quantisations`);
    }
  }

  const existing = readFileSync(OUT, "utf8");
  const previous = JSON.parse(existing) as { models: ModelSpec[] };
  const file = {
    schemaVersion: SCHEMA_VERSION,
    models: mergePreservingTimestamps(built, previous.models),
  };

  // Validate before writing: a file that fails the app's own schema must
  // never reach disk, because the app throws on load rather than degrading.
  modelsFileSchema.parse(file);

  const serialised = JSON.stringify(file, null, 2) + "\n";
  if (serialised === existing) {
    console.log("no change");
    return;
  }
  writeFileSync(OUT, serialised);
  console.log(`wrote ${file.models.length} models`);
}

main().catch((error) => {
  console.error(error instanceof IngestError ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 6: Add the npm script**

In `package.json` scripts:

```json
    "ingest": "vite-node scripts/ingest/main.ts",
```

- [ ] **Step 7: Run it for real, then verify the app still agrees**

Run: `npm run ingest`
Expected: three `ok …` lines, then `wrote 3 models` or `no change`.

Then: `npm test -- --run` and `npm run build`
Expected: PASS and a clean build.

**If a golden anchor moved, stop and report it — do not update the anchor.** The anchors are printed in `docs/design/style-reference.html` too, and a moved anchor means upstream data changed in a way a human needs to look at.

- [ ] **Step 8: Commit**

```bash
git add package.json scripts/ingest data/models.json
git commit -m "feat: ingestion runner, stable across unchanged runs"
```

---

## Task 8: the cron

**Files:**
- Create: `.github/workflows/refresh-data.yml`

**Interfaces:**
- Consumes: `npm run ingest`
- Produces: a scheduled commit to `main` when, and only when, `data/models.json` changes

- [ ] **Step 1: Write the workflow**

```yaml
name: Refresh model data

on:
  schedule:
    # 04:00 UTC on Mondays. Upstream config.json files change rarely; a
    # nightly run would mostly prove that nothing happened.
    - cron: "0 4 * * 1"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      # No HF_TOKEN: architecture is read from the ungated mirrors named in
      # config/families.json, so this runs for forks and pull requests too.
      - run: npm run ingest
      - run: npm test -- --run
      - run: npm run build
      - name: Commit if the data moved
        run: |
          if [[ -z "$(git status --porcelain data/models.json)" ]]; then
            echo "no change"; exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/models.json
          git commit -m "chore: refresh model data"
          git push
```

The tests and build run **before** the commit step on purpose: a bad upstream value must fail the job, not land on `main`.

- [ ] **Step 2: Verify the workflow parses**

Run: `npx --yes js-yaml .github/workflows/refresh-data.yml > /dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/refresh-data.yml
git commit -m "ci: refresh model data weekly, committing only real changes"
```

- [ ] **Step 4: Trigger it once by hand**

After pushing, run the workflow from the Actions tab via `workflow_dispatch` and confirm it either commits a reviewable diff or reports `no change`.

---

## Self-Review

**Spec coverage.** §6 step 1 → Task 4. Step 2 → Task 5. Step 3 → Task 5 (`withEstimates`). Step 4 → Task 6 (benchmarks merged, never derived). Step 5 → Task 7 (`modelsFileSchema.parse` before writing). Step 6 → Task 7 (write only on change). The scheduled workflow → Task 8. §12's `head_dim` risk → Task 4, tested. §4's `params.active` nullability → Task 6, tested. The carried `breakdown: Breakdown | null` item → Task 1.

**Deliberately not covered.** `memBandwidthGBs` comes from `data/gpus.json`, which is hand-curated and outside this pipeline. The `_source` strings in `config/benchmarks.json` stay invisible to the app — per-score attribution on screen needs a `ModelSpec` field and is its own decision.

**Known consequence to watch.** Task 5 admits only quantisations present in `GGUF_BPW`. `bartowski` publishes `Q5_K_L`, `Q6_K_L`, `IQ1_M`, `IQ2_S` and others that will be skipped. That is deliberate — an id the table cannot price would appear in the quant control and then fail to size for any model lacking that exact file — but real files are being ignored, and widening `GGUF_BPW` is the way to admit them.

**Verified before writing this plan, not assumed.** `meta-llama/…/config.json` → 401 anonymously; `api/models/meta-llama/…` → 200 but carries only `architectures` and `model_type`; `unsloth/Meta-Llama-3.1-8B-Instruct` → all four fields present; `NousResearch/…` → `head_dim` absent, derivable as 4096/32 = 128; `?blobs=true` → 24 GGUF files with real sizes for the 8B, 38 for the 70B including two- and four-part splits; `safetensors.total` → 8,030,261,248 for the 8B.
