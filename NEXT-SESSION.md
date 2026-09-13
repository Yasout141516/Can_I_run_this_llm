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
| 2 — Calculator UI & model report | **Merged.** `/` calculator, `/model/:id` report. |
| 3 — Ingestion pipeline + GitHub Actions cron | Not started. Only 3 seed models ship today. |
| 4 — Benchmarks page, `/detect`, coach-mark tour | Not started. |

`main` is green: **160 tests across 18 files**, `npm run build` clean. `npm run dev` serves on
http://localhost:5173.

## Two things are queued and ready to start

### 1. Welcome landing page — design APPROVED, not yet implemented

The user asked for a front door rather than landing straight on results. Design agreed in
conversation; no code written. Implement it as a **bounded** change (no spec, no plan doc) —
the approval gate has already been passed.

**Routing.** `/` → new `WelcomePage`; the calculator moves to `/calculator`; `/model/:id`
unchanged. `HardwareProvider` stays above all three so hardware survives navigation.

**Landing content.** The masthead copy that lives on the calculator today (eyebrow
"WILL IT RUN?", `Runcheck`, the one-line pitch), then what the three verdicts *mean* —
rendered with the real `VerdictPill` so the legend is the same component the results use, not
a drawing of it. Then a primary CTA into the calculator, and one line on the differentiator:
every answer shows its arithmetic. **No live data on it** — with 3 seed models "3 models
tracked" undersells; add that line after Plan 3.

**`Button` comes back.** Plan 2 deliberately dropped `Button.tsx` (nothing imported it), and
the `/simplify` pass then deleted the `.btn` CSS block as dead. A CTA is the consumer that was
missing. Restore both from `docs/design/style-reference.html` — the `steps(2)` press with a
4px translate into the shadow is spec §9's identity-carrying detail and currently applies to
nothing clickable.

**Files:**
- Create `src/pages/WelcomePage.tsx`, `src/components/ui/Button.tsx`, plus tests
- Modify `src/App.tsx` (routes), `src/styles/tokens.css` (restore `.btn`, add landing rules)
- Modify `src/features/report/ModelReport.tsx` — **both** back-links currently point at `/`
  (lines ~27 and ~39); they become `/calculator`
- Update `src/features/report/__tests__/report.test.tsx:74` — the shared-state regression test
  renders the real `<App/>` with `initialEntries={["/"]}` and expects the calculator. It
  becomes `["/calculator"]`. **Do not weaken this test** — it is the only guard that fails if
  the shared `HardwareProvider` is removed.

**Explicitly not in scope:** no hardware wizard, no overlay, no persistent nav bar, no
localStorage "skip the welcome". Each is its own decision.

**Testing:** landing renders and its CTA links to `/calculator`; `App` routes `/` to the
welcome page and `/calculator` to the tool; the report's back-link points at `/calculator`.
Existing `CalculatorPage` tests render the component directly and are unaffected — including
"results at rest, no submit step", which still holds for the calculator itself.

### 2. Form inputs overflow their panel — diagnosed, one-line fix

**Symptom:** in the hardware panel, the VRAM and System RAM number inputs render wider than
the cream card and spill past its right border. The `<select>` controls beside them fit.

**Root cause (verified, not guessed):** `box-sizing` is never set anywhere in
`src/styles/tokens.css`. `.input, .select` at line ~150 sets `width: 100%` plus
`padding: 12px 14px` and `border: var(--bw)` (3px) — so the rendered box is 34px wider than
its container. The asymmetry is because Chrome's UA stylesheet already gives `<select>`
`box-sizing: border-box` while `input[type=number]` stays `content-box`.

**Fix:** add the standard reset near the top of `tokens.css`:

```css
*, *::before, *::after { box-sizing: border-box; }
```

One rule, fixes every current and future instance. Check the table view and the memory bar
afterwards — both use percentage widths and should be unaffected, but look rather than assume.

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
src/components/ui/        Badge, Chip, Field, HelpDot, Pill, Segmented,
                          TightFitBadge, WhyNote
src/hooks/                useHardwareForm (+ HardwareProvider)
src/features/hardware/    HardwarePanel, DeviceLookup
src/features/results/     useVerdicts, StatTiles, Filters, ModelList,
                          ModelCard, ModelTable, sort, ResultsEmptyState
src/features/report/      ModelReport, MemoryBar, QuantTable, RunItBlock
src/pages/                CalculatorPage
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
2. **The report shows no benchmark scores**, though spec §8 lists them and the data is
   populated and validated. A plan-level omission.
3. **A deep-linked report has no hardware summary** — `/model/:id` says "of your VRAM" while
   scoring against the recipient's defaults, with nothing saying so.
4. **No SPA fallback for `BrowserRouter`.** No `vercel.json` / `netlify.toml` / `_redirects`.
   On a plain static host, a direct request to `/model/:id` 404s. Whoever owns deployment
   needs a rewrite rule — and the welcome page makes this more visible, not less.
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
