# Handoff — Runcheck, 2026-09-13

Picking up in a fresh conversation. Everything below is current as of `main` @ `e997bf4`.

Read this first, then [`docs/superpowers/notes/2026-09-13-carried-into-plan-3.md`](docs/superpowers/notes/2026-09-13-carried-into-plan-3.md).

## What Runcheck is

A static web app that tells you whether a given LLM will run on your hardware. You describe
your machine and inference settings; it sorts every tracked model into **Run on GPU**,
**CPU Offloaded**, or **Won't Run**, and shows the arithmetic behind each verdict rather than
a bare red X. Inspired by runthisllm.com, llmrun.dev and canirun.ai — none of which publish
their math.

Binding spec: [`docs/superpowers/specs/2026-09-12-llm-hardware-compatibility-checker-design.md`](docs/superpowers/specs/2026-09-12-llm-hardware-compatibility-checker-design.md)
Approved visual design: [`docs/design/style-reference.html`](docs/design/style-reference.html)

## Where the work stands

| Plan | State |
|---|---|
| 1 — Foundation & compatibility engine | **Merged.** Pure engine + validated data layer. |
| 2 — Calculator UI & model report | **Merged.** `/calculator`, `/model/:id` report. |
| Welcome page + box-sizing fix | **Done this session**, see below. |
| Nav bar, Browse page, home best-fits | **Done this session**, see below. |
| 3 — Ingestion pipeline + GitHub Actions cron | Not started. Only 3 seed models ship today. |
| 4 — Benchmarks page, `/detect`, coach-mark tour | Not started. |

`main` is green: **201 tests across 22 files**, `npm run build` clean. `npm run dev` serves on
http://localhost:5173.

## What this session did

Both items that were queued as ready are implemented, tested and green — not yet committed
at the time of writing.

### 1. Welcome landing page — done

`/` is now `WelcomePage`; the calculator moved to `/calculator`; `/model/:id` unchanged, with
`HardwareProvider` still above all three. The landing page carries the masthead copy, a legend
of the three verdicts rendered with the real `VerdictPill`, a primary CTA into the calculator,
and one line on the differentiator. It quotes no live numbers — there is a test asserting it
renders *outside* a `HardwareProvider`, which is what pins that down.

`Button.tsx` is back, as a router `Link` styled `.btn .btn-primary`. It deliberately renders an
anchor, not a `<button>`: its only consumer is a destination. If the Plan 4 coach-mark needs a
real button, give the file a sibling rather than widening this one. The restored `.btn` CSS
block omits `.btn-ghost`, `.btn-secondary` and `.btn[disabled]` — no consumer, and `/simplify`
would delete them again.

Both report back-links now point at `/calculator`. The shared-state regression test moved to
`initialEntries={["/calculator"]}` with its assertions untouched — it still fails if the shared
`HardwareProvider` is removed.

### 2. Form inputs overflowing their panel — done

`*, *::before, *::after { box-sizing: border-box; }` added near the top of `tokens.css`, and the
same reset added to `docs/design/style-reference.html`, which had the identical defect and would
otherwise reintroduce it on the next port.

Three explicitly-sized bordered elements were bumped to keep the geometry the approved design
renders, now that the border counts inward: `.help` 19→23px, `.legend i` 11→15px, `.bar`
height 30→34px, in both files. The memory-bar segments and `.model-table` are *improved* rather
than affected — each previously overflowed its container by its own border width and now sums
exactly.

**Still open: nobody has looked at the running app.** The analysis above is static reading of
the CSS; no browser automation is installed in this repo and none was added. `npm run dev`,
then eyeball the hardware panel, the table view and the report's memory bar.

### 3. Nav bar, Browse page, home best-fits — done

Brainstormed and approved in conversation; no spec doc, by agreement, once Compare was dropped
from scope. Routes are now:

```
/            Home       hero + verdict legend + best-fits list
/calculator  Check my hardware — unchanged
/browse      Browse LLMs — the catalogue
/model/:id   Report — unchanged
```

`Nav` sits above `<Routes>` inside `HardwareProvider`, on every page. `NavLink` marks the active
route with `aria-current="page"`, styled as the inverted-ink treatment a pressed chip uses. The
wordmark is a `Link`, never an `h1` — home owns the only one.

**Browse is deliberately verdict-free.** It answers "what is this model": family, params (with
the MoE split), layers, max context, smallest quant with its measured/estimated provenance,
categories. No hardware, no pills — whether it runs is the calculator's question and the
report's. There is a test asserting no verdict text appears there.

To let both lists share one definition of "matches", `applyFilters` was split: `matchesModel()`
is the predicate, `applyFilters()` is its `ScoredModel[]` wrapper, and Browse filters bare
`ModelSpec[]` through the same function. Sorting splits by what it needs: verdict-dependent keys
stay in `sortRows`, data-only keys (`name`/`params`/`context`/`size`, where size is the smallest
quant) live in `sortModels`. `Filters` is now generic over its sort-key type and takes a
`sortOptions` list, so a page cannot offer a sort its list cannot perform; its view toggle is
optional and Browse passes none.

**Home now scores models**, so the welcome page's "renders outside a HardwareProvider" test is
gone — that test pinned a design decision that has since been reversed, and was deleted rather
than weakened. Home shows the six best fits via the existing `ModelCard`, ordered by
`sortRows(rows, "compatibility")`, above a `Browse all models →` link.

`HardwareSummary` (in `src/features/hardware/`) states the machine a page scored against, with
`change →` into the calculator. **It is the fix for known gap 3** — drop it into `ModelReport`
and a deep-linked report stops saying "of your VRAM" about hardware the recipient never set.

## Architecture, in one screen

```
config/families.json      hand-edited: tracked HF orgs/repos
config/benchmarks.json    hand-edited: benchmark scores + sources
data/models.json          3 seed models (Plan 3 regenerates this)
data/gpus.json            12 GPUs, hand-curated
data/laptops.json         5 laptops, hand-curated
src/lib/compat/           THE ENGINE — pure, no React/fetch/fs/clock/locale
src/lib/data/             schema validation + load-once
src/lib/ui/               format.ts, paths.ts
src/components/Nav.tsx    the persistent nav bar
src/components/ui/        Badge, Button, Chip, Field, HelpDot, Pill, Segmented,
                          TightFitBadge, WhyNote
src/hooks/                useHardwareForm (+ HardwareProvider)
src/features/hardware/    HardwarePanel, DeviceLookup, HardwareSummary
src/features/browse/      CatalogTable
src/features/results/     useVerdicts, StatTiles, Filters, ModelList,
                          ModelCard, ModelTable, sort, ResultsEmptyState
src/features/report/      ModelReport, MemoryBar, QuantTable, RunItBlock
src/pages/                WelcomePage, CalculatorPage, BrowsePage
```

## Rules that are settled — do not relitigate without a reason

- **`src/lib/compat/` is pure and deterministic.** No React, `fetch`, `node:fs`, `Date.now()`,
  `toLocaleString`, `Math.random`, `performance.now`, `Intl.`, `process.`, `window.`,
  `localStorage`. `purity.test.ts` enforces this by scanning source text **including
  comments** — a comment mentioning a banned token fails the suite.
- **The UI never re-implements the math.** If a number can come from `evaluate()`, it does.
  `formatPercent` is the one presentation exception, and it deliberately does not clamp at
  100% — "200%" tells the user how far over they are.
- **Three golden anchors must not move:** `6_591_932_032` (Llama 3.1 8B total),
  `45_781_810_560` (Llama 3.3 70B total), `gpuLayers` = 16. They are also printed in
  `docs/design/style-reference.html` — **if one moves, that page is now wrong too.**
- **Bytes internally, decimal GB at the edges.** `1 GB = 1_000_000_000`. Never GiB.
- **Status is never carried by colour alone** — glyph, word, and colour, everywhere.
- **A lookup prefills form state and then has no authority.** No locked or "custom" mode;
  overriding a prefilled value is just typing.
- **Hardware lives in one `HardwareProvider` above all routes**, so the report scores against
  what the user configured rather than defaults.
- **Three verdict buckets, not four.** "Tight fit" is a presentation flag derived from the
  percentage, in offload amber beside the pill — the engine's contract is unchanged.
- **Overhead constants are empirical** (`GGUF_OVERHEAD`, `SERVER_OVERHEAD` in `engines.ts`),
  calibrated so the 8B anchor lands at 0.60 GB. First thing to tune against real reports.

## Known gaps, in priority order

From the final review of Plan 2. Full detail in the carried-into-plan-3 note.

1. **`Verdict` should say when it has no breakdown.** `QuantTable` infers "the engine gave up
   before computing" from `totalBytes === 0` — shape-inference the engine should state
   outright (`breakdown: Breakdown | null`). Every new early-return guard in `evaluate()` must
   currently remember to zero the breakdown for this to keep working. **Do this in Plan 3.**
2. **Benchmark scores still render nowhere** — not on the report (spec §8 lists them), not on
   Browse, though the data is populated and validated. Browse is their natural home; it was
   left out of that page's scope deliberately rather than widened without asking.
3. **A deep-linked report has no hardware summary** — `/model/:id` says "of your VRAM" while
   scoring against the recipient's defaults, with nothing saying so. `HardwareSummary` now
   exists and solves exactly this; it just has not been added to the report.
4. **No SPA fallback for `BrowserRouter`.** No `vercel.json` / `netlify.toml` / `_redirects`.
   On a plain static host, a direct request to `/model/:id` or `/browse` 404s. **Now four
   deep-linkable routes, so this is worse than when it was written.** Two-line file; flagged
   and deliberately not fixed without a decision on the host.
5. **"Of your VRAM" understates vLLM and SGLang** — the percentage is of full `usableVram`,
   but those engines only get `memoryUtilization` (90%) of it.
6. **Heading hierarchy is thin** — one `h1`, no `h2`s; model names are links, not headings.
7. **Result-list state is lost on return** — query, categories, sort and view are local state;
   the report's back-link resets all four.

## How this project has been run

Superpowers throughout: `brainstorming` → `writing-plans` → `subagent-driven-development`
(fresh implementer per task, task review after each, whole-branch review at the end) →
`/simplify` → `finishing-a-development-branch`. Plans live in `docs/superpowers/plans/`,
specs in `docs/superpowers/specs/`.

Working preferences observed so far: confirm the design before writing code; keep the planning
visible; pause before web searches or external fetches rather than doing them autonomously;
commit everything to https://github.com/Yasout141516/Can_I_run_this_llm.

The welcome page is **bounded and already approved** — it does not need a new spec or plan,
just implementation with TDD. Plan 3 is architectural and gets the full treatment.
