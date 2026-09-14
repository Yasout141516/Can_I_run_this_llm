# Carried out of Plan 3 — the ingestion pipeline

Plan 3 completed on 2026-09-14 at `64675c7`. Its execution workspace has been deleted; this is
what outlives it — the decisions taken, what they cost if they were wrong, and what is still open.

Plan: [`docs/superpowers/plans/2026-09-14-ingestion-pipeline-and-ci.md`](../plans/2026-09-14-ingestion-pipeline-and-ci.md)
Pipeline docs: [`scripts/ingest/README.md`](../../../scripts/ingest/README.md)

## The one decision that blocks everything else

**`"auto"` has no definition, and real data makes that fatal.**

`src/lib/compat/evaluate.ts` resolves `quantId: "auto"` as `loadable[0]` — the first entry in the
model's quants array, **with no fit check at all**. The hand-written seed data happens to list a
fitting quantisation first, which is why this survived two plans unnoticed. Ingested data emits
quants in `GGUF_BPW` order, which begins at FP16, so against real data `"auto"` selects the
largest quantisation for every model and almost nothing runs. **16 tests across 6 files fail on
real data for this reason alone.**

This was deliberately not fixed. The spec declares `quantId: string | "auto"` (§4) and never says
what auto should *choose*. The plausible readings differ materially:

| Reading | Consequence |
|---|---|
| **Best quantisation that fits** | What the word implies in a tool whose question is "will it run". Changes verdicts app-wide; "won't run" becomes much rarer, because auto would fall back through Q4 rather than giving up at FP16. |
| **Best quality available, fit be damned** | What the code does today. Defensible as "here is the model at its best, and here is why it won't fit" — but then the results list is mostly red. |
| **A fixed default, e.g. Q4_K_M** | Predictable and explainable, ignores that a 24 GB card could run something better. |

Whichever is chosen, `evaluate.ts`'s comment and `scripts/ingest/quants.ts`'s note about emission
order both currently describe the open question and will need updating.

**A second, smaller thing waits on the same decision.** `withEstimates` emits only `GGUF_BPW` ids,
so a real run drops the `AWQ-4bit` entry Llama 3.1 8B currently carries. No config file can
reproduce it — `config/families.json` has no quant curation and `assembleModel` replaces the whole
`quants` array. `HardwarePanel.test.tsx:78` and `report.test.tsx:42,127` depend on it existing.

**Do not build the GitHub Actions cron until both are resolved.** It was cut from the run, which
turned out to be lucky: a scheduled job would have failed at `npm test` on its first real run and
kept failing weekly.

## Rulings taken during execution

Each was a decision made without asking, with what it costs if it was wrong.

1. **Task 1's file list was incomplete — every `breakdown` consumer was fixed, not the two named.**
   Seven non-test files read it. *Cost: none.*
2. **`scripts/**` tests pinned to the node environment**, since `vite.config.ts` sets jsdom globally
   and those tests stub `fetch` and construct `Response`. *Cost: a redundant docblock per file.*
3. **Work proceeded on a branch, not a separate worktree.** *Cost: running `main` concurrently needs
   a stash.*
4. **GGUF files named `f16` are skipped** — `quantIdOf` matches `GGUF_BPW` keys, which spell it
   `FP16`. *Cost: FP16 shows "estimated" where a measured size existed. bpw for FP16 is exact at 16
   bits, so no verdict moves.*
5. **Overruled the plan: `fetchModelInfo` must not default away a missing `siblings` or `id`.**
   `siblings ?? []` would silently mean "this model has no GGUF files" and downgrade every size to
   an estimate. Spec §12 binds: validate and fail loudly rather than default. *Cost: a
   malformed-but-usable response aborts the run instead of yielding partial data. Recoverable — the
   previous `data/models.json` is untouched.*
6. **One Minor was folded into a fix round** already editing that file. *Cost: none.*
7. **Overruled the plan again: `head_dim` must distinguish absent from present-but-invalid.** The
   plan specified `typeof config.head_dim === "number" ? … : derive`, which takes the derive branch
   for `null` and `"128"` as readily as for a missing key. Correct test is `=== undefined`, since
   JSON cannot carry `undefined`. *Cost: a config with a deliberately-null `head_dim` aborts instead
   of deriving a value that would usually have been right.*
8. **Accepted an implementer editing `src/lib/compat/types.ts`** after being told not to. Task 2 had
   added `archRepo` to the zod schema but the plan never added it to the matching TypeScript
   interface, so the two were out of sync. Purity means the absence of banned runtime tokens, not
   immutability of the directory. *Cost: none.*
9. **Parked the `"auto"` defect and left `data/models.json` un-regenerated.** See above. *Cost: the
   pipeline ships working but switched off.*

## What the review loop caught

Worth recording, because three of these were in code the plan itself specified, and the fourth was
invisible to every per-task review.

- **A split GGUF recorded the wrong filename.** The group kept whichever shard appeared first in the
  API listing, not shard 1. `runCommand` feeds `quant.fileName` into `llama-cli -m …`, and llama.cpp
  opens a sharded model via its *first* shard — so the app would have printed a copy-pasteable
  command that cannot load the model. Only visible with `scripts/ingest/` and
  `src/lib/compat/runCommand.ts` in view at once, which no per-task reviewer had.
- **A test asserting `NaN` against `NaN`.** `expect(size).toBe(params * GGUF_BPW.Q8_0! / 8)` looks
  like it guards the bits-per-weight table; if the key vanished both sides become `NaN`, and
  Vitest's `toBe` is `Object.is`, where `Object.is(NaN, NaN)` is true. The test passed either way,
  and the implementer's report claimed the opposite in writing.
- **A duplicated split part.** Grouping counted files and accepted a split when `parts === expected`,
  which catches a missing part but not a repeated one: two files both encoding `00001-of-00002`
  satisfy the count with no second part present, yielding shard one's size doubled and badged
  `measured`.
- **`scripts/` was not typechecked for three tasks** while a report claimed it was. `tsconfig.json`
  had `"include": ["src"]`; `tsc --listFiles` returned zero files under `scripts/`.

## Deferred, still open

Recorded during execution and judged not to block merge.

- The `categories` enum literal is duplicated at `src/lib/data/schema.ts:67` and `:115`. A shared
  `CATEGORIES` const would remove a real drift risk, cheaply.
- `benchmarks` is a `z.record`, whose key order zod preserves rather than normalises — a
  hand-reordered `data/models.json` would cause spurious timestamp churn.
- `scripts/ingest/main.ts` has no unit test, so the zero-measured-quantisations guard is verified by
  inspection only. A future refactor of that loop could break it silently.
- `assemble.test.ts` never asserts `source.hfRepo`'s value, so swapping `hfRepo` and `archRepo`
  would pass every test. The production code is correct; this is a coverage gap.
- The `modelSchema.parse` round-trip cannot catch a stray extra field — zod strips unknown keys
  rather than rejecting them. `.strict()` would close it.

## Skipped by the /simplify pass, with reasons

These were raised by the cleanup review and deliberately not applied:

- **Parallelising `main.ts`'s per-repo fetches.** Would change which error surfaces first, in a file
  no unit test covers, to save latency on a job that runs weekly.
- **Extracting `main.ts`'s loop body into `ingestRepo()`.** Reasonable, unverifiable for the same
  reason.
- **Replacing `GATED_ORGS` with a per-repo `gated` flag in `config/families.json`.** The API already
  reports gating per repo, and a hardcoded org list can drift from reality. A real improvement, but a
  design change rather than a cleanup.
- **Splitting `GGUF_BPW` into a pricing table and a recognition vocabulary.** It currently serves
  both, which is why `Q5_K_L`, `IQ1_M` and `f16` files are silently dropped. Which ids to support is
  a product decision — the same flavour as `"auto"`, much smaller.
- **Deriving `ModelSpec` from `z.infer<typeof modelSchema>`.** The two have been dual-declared since
  Plan 1; unifying them touches every field, not just `source`.
