# Handoff — Runcheck, 2026-09-14

Current as of `main` @ `64675c7`. Read this, then
[`docs/superpowers/notes/2026-09-14-carried-out-of-plan-3.md`](docs/superpowers/notes/2026-09-14-carried-out-of-plan-3.md)
for the decision record — every ruling taken without asking, what it costs if it was wrong, and
what the review loop caught.

## What Runcheck is

A static web app that tells you whether a given LLM will run on your hardware. You describe your
machine and inference settings; it sorts every tracked model into **Run on GPU**, **CPU Offloaded**
or **Won't Run**, and shows the arithmetic behind each verdict rather than a bare red X. Inspired by
runthisllm.com, llmrun.dev and canirun.ai — none of which publish their math.

Binding spec: [`docs/superpowers/specs/2026-09-12-llm-hardware-compatibility-checker-design.md`](docs/superpowers/specs/2026-09-12-llm-hardware-compatibility-checker-design.md)
Approved visual design: [`docs/design/style-reference.html`](docs/design/style-reference.html)

`main` is green: **261 tests across 29 files**, `npm run build` clean. `npm run dev` serves on
http://localhost:5173.

## Where the work stands

| Plan | State |
|---|---|
| 1 — Foundation & compatibility engine | **Merged.** Pure engine + validated data layer. |
| 2 — Calculator UI & model report | **Merged.** |
| Welcome page, nav, Browse, Benchmarks | **Merged** 2026-09-13/14. |
| 3 — Ingestion pipeline | **Merged, but not switched on.** See the blocker below. |
| 3b — GitHub Actions cron | **Not built.** Cut mid-run. Do not build it until the blocker is resolved. |
| 4 — `/detect`, coach-mark tour | Not started. |

## START HERE: one decision blocks the pipeline

`src/lib/compat/evaluate.ts` resolves `quantId: "auto"` as `loadable[0]` — the first entry in the
model's quants array, **with no fit check at all**. Hand-written seed data happens to list a fitting
quantisation first, which is why nobody noticed. Real ingested data emits quants in `GGUF_BPW`
order, which begins at FP16, so `"auto"` would pick the largest quantisation for every model and
almost nothing would run. **16 tests fail on real data for this reason.**

The spec declares `quantId: string | "auto"` (§4) but never says what auto should *choose*. Deciding
it changes verdicts across the whole app, so it was parked rather than guessed at. The readings and
their consequences are laid out in the carried-out note. **Everything about the ingestion pipeline
is waiting on this.**

## Four routes, all live

```
/            Home       hero + verdict legend + best-fits list (scored, hardware-aware)
/calculator  The tool   hardware panel + live results
/browse      Catalogue  every tracked model, verdict-free, searchable and sortable
/model/:id   Report     memory breakdown, every quantisation, run command
/benchmarks  Scores     sortable table + a glossary of what each benchmark measures
```

`Nav` sits above `<Routes>` inside `HardwareProvider`, on every page.

## Architecture, in one screen

```
config/families.json      hand-edited: tracked repos + arch mirrors + GGUF repos
config/benchmarks.json    hand-edited: benchmark scores + the source of each
data/models.json          3 models — still the HAND-WRITTEN one, see the blocker
data/gpus.json            12 GPUs, hand-curated
data/laptops.json         5 laptops, hand-curated
scripts/ingest/           the pipeline: hfClient, architecture, quants, assemble,
                          diff, main (+ README). Run with `npm run ingest`.
src/lib/compat/           THE ENGINE — pure, no React/fetch/fs/clock/locale
src/lib/data/             schema validation + load-once
src/lib/ui/               format.ts, paths.ts
src/components/           Nav; ui/ holds Badge, Button, Chip, Field, HelpDot, Pill,
                          Segmented, TightFitBadge, WhyNote
src/hooks/                useHardwareForm (+ HardwareProvider)
src/features/hardware/    HardwarePanel, DeviceLookup, HardwareSummary
src/features/browse/      CatalogTable
src/features/benchmarks/  benchmarkMeta (labels, blurbs, ranking), ScoreTable
src/features/results/     useVerdicts, StatTiles, Filters, ModelList, ModelCard,
                          ModelTable, sort, ResultsEmptyState
src/features/report/      ModelReport, MemoryBar, QuantTable, RunItBlock
src/pages/                WelcomePage, CalculatorPage, BrowsePage, BenchmarksPage
```

## Rules that are settled — do not relitigate without a reason

- **`src/lib/compat/` is pure and deterministic.** No React, `fetch`, `node:fs`, `Date.now()`,
  `toLocaleString`, `Math.random`, `performance.now`, `Intl.`, `process.`, `window.`,
  `localStorage`. `purity.test.ts` scans source text **including comments** — a comment merely
  mentioning a banned token fails the suite.
- **Ingestion validates and fails loudly rather than defaulting** (spec §12). A partially-correct
  `data/models.json` is worse than a stale one. Two of this plan's own specified code blocks were
  overruled to honour this.
- **Benchmark scores are hand-curated, never scraped** (spec §6). Ingestion merges
  `config/benchmarks.json`; it never derives a score. A `null` means "not reported" and is
  deliberately distinct from zero.
- **The UI never re-implements the math.** If a number can come from `evaluate()`, it does.
- **Three golden anchors must not move:** `6_591_932_032` (Llama 3.1 8B total),
  `45_781_810_560` (Llama 3.3 70B total), `gpuLayers` = 16. They are also printed in
  `docs/design/style-reference.html` — if one moves, that page is wrong too.
- **Bytes internally, decimal GB at the edges.** `1 GB = 1_000_000_000`. Never GiB.
- **Status is never carried by colour alone** — glyph, word, and colour, everywhere.
- **A lookup prefills form state and then has no authority.** Overriding a prefilled value is just
  typing.
- **Hardware lives in one `HardwareProvider` above all routes.** A regression test renders the real
  `<App/>` and fails if it is removed.
- **Three verdict buckets, not four.** "Tight fit" is a presentation flag derived from the
  percentage.
- **Overhead constants are empirical** (`GGUF_OVERHEAD`, `SERVER_OVERHEAD` in `engines.ts`),
  calibrated so the 8B anchor lands at 0.60 GB.

## Known gaps, in priority order

1. **`"auto"` is undefined** — see above. Blocks the pipeline.
2. **No SPA fallback for `BrowserRouter`.** No `vercel.json` / `netlify.toml` / `_redirects`. On a
   plain static host a direct request to `/browse` or `/model/:id` 404s. **Deferred: the host is
   undecided.** GitHub Pages supports no rewrites at all and needs either the `404.html` trick or
   `HashRouter`, *plus* a Vite `base` and a router `basename`, because a project repo serves from
   `/<repo>/` rather than the domain root.
3. **The report shows no benchmark scores**, though spec §8 lists them and `/benchmarks` renders
   them elsewhere. A small addition to `ModelReport` now.
4. **Per-score benchmark provenance is invisible.** `_source` lives in `config/benchmarks.json`,
   which the app never loads, and `ModelSpec` has no field for it. Putting real attribution on
   screen is an ingestion-time schema decision, like `license` and `releasedAt`.
5. **A deep-linked report has no hardware summary** — `HardwareSummary` exists and solves exactly
   this; it just is not wired into `ModelReport`.
6. **"Of your VRAM" understates vLLM and SGLang** — the percentage is of full `usableVram`, but
   those engines only get `memoryUtilization` (90%) of it.
7. **Heading hierarchy is thin** — model names are links, not headings.
8. **Result-list state is lost on return** — query, categories, sort and view are local state.

Smaller items deferred during Plan 3 are listed in the carried-out note rather than here.

## How this project has been run

Superpowers throughout: `brainstorming` → `writing-plans` → `subagent-driven-development` (fresh
implementer per task, task review after each, whole-branch review at the end) → `/simplify` →
merge. Plans live in `docs/superpowers/plans/`, specs in `docs/superpowers/specs/`, decision records
in `docs/superpowers/notes/`.

Working preferences observed: confirm the design before writing code; keep the planning visible;
pause before web searches or external fetches rather than doing them autonomously; commit to
https://github.com/Yasout141516/Can_I_run_this_llm.

**Nobody has looked at the app in a browser this week.** The welcome page, nav, Browse table,
Benchmarks table and the `box-sizing` fix have been verified only in jsdom and by reading CSS.
