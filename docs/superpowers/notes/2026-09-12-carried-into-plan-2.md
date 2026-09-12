# Carried out of Plan 1 into later plans

Plan 1 (foundation and compatibility engine) merged to `main` on 2026-09-12 at `cd0f947`.
Its execution workspace has been deleted; these are the items from it that outlive it.

## Must be honoured by Plan 2 (calculator UI)

**The quantisation control must filter by `engine.formats`.** Spec §4 requires it, and
`evaluate()` depends on it for an honest message. `selectQuant` returns `null` both when
the engine supports none of the model's formats and when it supports the format but not
the specific `quantId` — and the note says "cannot load any quantisation of this model",
which is false in the second case. Reachable today: `llama8b` ships Q4_K_M (gguf) and
AWQ-4bit (awq); asking vLLM for `Q4_K_M` produces that false note. If the UI filters the
dropdown, a user can never reach it.

**Context-guard verdicts zero the breakdown.** When `contextLength` exceeds the model's
maximum, `evaluate()` returns all-zero `breakdown` values and `quantId: null`. Spec §5
sells the breakdown with "your VRAM is fine, your context length is not beats a red X" —
but that is precisely the case with nothing to render. Either the report page special-cases
it, or `evaluate()` should compute the breakdown before the guard.

**Pin the vLLM memory-utilisation test properly.** `runCommand.ts` reads
`getEngine("vllm").memoryUtilization`, which is correct, but the test asserting it cannot
fail: `ENGINES.vllm.memoryUtilization` and `DEFAULT_MEMORY_UTILIZATION` are both `0.9`, so
the assertion compares a value to itself. Make the vLLM template read the engine for
`settings.engine` and test with a profile whose utilisation differs from the default.

**`evaluate()` runs per model per keystroke.** The UI plan assumes ~300 models re-evaluated
on every input change with no debounce. The efficiency review confirmed a single call is
cheap (arithmetic over ≤3-element arrays), so the cost driver is call *count*, not call
cost. Debounce or memoise at the UI layer — not inside `src/lib/compat/`, which must stay
deterministic and cache-free.

## Spec gap — needs a decision before Plan 2 builds the engine selector

**Engine × hardware compatibility is unmodelled.** `EngineProfile` has no field saying
which hardware an engine can run on, so vLLM on Apple Silicon currently returns
`run-on-gpu` — vLLM has no Metal backend. Either add a compatibility field to the profile
(engine-as-data, consistent with the existing design) or have the UI restrict the engine
list by `hw.kind`. The first is the deeper fix.

## Deferred to Plan 3 (ingestion pipeline)

- Add an `engines` field to `package.json` pinning Node 20+. Not blocking today — vite 5
  and vitest 2 already require ≥18 — but the ingestion job makes it load-bearing.
- Consider making `QuantOption.sizeBytes` optional, present only for measured quants,
  instead of the current `0` sentinel for estimated ones. Cheap now (three data files),
  expensive once the pipeline is producing files against the lenient schema.
- The purity test is a tripwire, not proof: it scans source text non-recursively over the
  top level of `src/lib/compat` only, and cannot see impurity reached through a transitive
  import. A future `compat/<subdir>/` would go unscanned.

## Known approximations (deliberate, documented, not defects)

- Bits-per-weight values for GGUF k-quants are approximations — k-quants mix precision per
  block. A measured file size always wins over the formula.
- `bytesPerLayer = weights / numLayers` divides weights evenly, ignoring embeddings and the
  output head, which are not per-layer tensors. Close enough for a layer count; the golden
  tests pin how far it may drift.
- Per-engine overhead constants (`GGUF_OVERHEAD`, `SERVER_OVERHEAD`) are empirical and
  calibrated so the 8B anchor lands at 0.60 GB. They are the first thing to tune against
  real-world reports. **If a golden anchor moves, `docs/design/style-reference.html` prints
  the same numbers and becomes wrong — update both.**
