# Carried out of Plan 2 into later plans

Plan 2 (calculator UI and model report) completed on 2026-09-13 at `1ed6453`. Its execution
workspace has been deleted; these are the items that outlive it.

## Should be fixed in Plan 3, before the ingestion pipeline lands

**`Verdict` should say when it has no breakdown, instead of leaving the UI to infer it.**
`QuantTable` currently decides whether to print a size with
`v.status === "wont-run" && v.breakdown.totalBytes === 0`. That is the UI inferring "the engine
gave up before computing anything" from the *shape* of the data. Its history makes the case:
it started as `limitingFactor === "format"`, then had to be widened when the engine guard
(vLLM on Apple Silicon) turned out to return the same all-zero breakdown. Every future
early-return guard in `evaluate()` must now remember to zero the breakdown for this heuristic
to keep working — an implicit contract nothing enforces, and nothing guarantees a genuinely
computed breakdown can never total exactly zero. The deeper fix is `breakdown: Breakdown | null`
or an explicit flag set by each guard.

**The benchmarks column has no key validation upstream.** `config/benchmarks.json` is
hand-curated and merged by the ingestion job; `modelsFileSchema` constrains benchmark keys to
the `BenchmarkId` enum, so a typo like `"mmluPro"` is now rejected at the gate — but only if
the ingestion job runs the schema. Make that the job's last step.

**`license` and `releasedAt` do not exist on `ModelSpec`.** The reference site `canirun.ai`
filters by licence and sorts by newest; both were declined in Plan 2 because the data isn't
there. If they're wanted, ingestion is where they enter.

## Deferred UI work (Plan 4 or a follow-up)

- **The report shows no benchmark scores.** Spec §8 lists them among the report's contents;
  `ModelSpec.benchmarks` is populated and validated. The Plan 2 tasks never mentioned it — a
  plan-level omission, not an implementation gap.
- **A deep-linked report has no hardware summary.** `/model/:id` is a shareable URL, but the
  page says "of your VRAM" and "on your hardware" while scoring against whatever the recipient's
  defaults are, with no controls and nothing saying so. Either show the hardware it used, or
  put hardware in the URL.
- **Result-list state is lost on return.** Query, categories, sort and view are local state;
  "← Back to all models" resets all four. Hardware survives via context; these do not.
- **No SPA fallback for `BrowserRouter`.** There is no `vercel.json` / `netlify.toml` /
  `_redirects`. On a plain static host a direct request to `/model/:id` 404s. Whoever owns
  deployment needs a rewrite rule.
- **"Of your VRAM" understates vLLM and SGLang.** The percentage is of full `usableVram`, but
  those engines only get `memoryUtilization` (90%) of it. The verdict is right; the percentage
  is optimistic.
- **Heading hierarchy is thin.** The calculator has one `h1` and no `h2`s; model names are
  links, not headings. Heading-based navigation yields nothing.
- **A `NumericInput` primitive** owning `useNumericField` internally, if more numeric fields
  appear. Three correct call sites today wire it by hand.

## Design decisions worth not relitigating

- **Three verdict buckets, not four.** `canirun.ai` splits results into Can run / Tight fit /
  Too heavy. "Tight fit" here is a *presentation* flag derived from the percentage, rendered in
  offload amber beside the verdict pill — the engine's three-way contract is unchanged and
  tested.
- **A lookup prefills form state and then has no authority.** There is no locked or "custom"
  mode; overriding a prefilled value is just typing. Tested.
- **Hardware state lives in one `HardwareProvider` above both routes**, so the report scores
  against what the user configured. There is a regression test that renders the real `<App />`
  and fails if the provider is removed.
- **Status is never carried by colour alone** — glyph, word, and colour, everywhere.
