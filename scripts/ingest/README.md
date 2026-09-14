# Ingestion pipeline

Rebuilds `data/models.json` from the Hugging Face API, using `config/families.json`
(which model repos to fetch, grouped into families) and `config/benchmarks.json`
(curated benchmark scores keyed by HF repo id) as inputs.

For each repo listed in `config/families.json` it:

1. Fetches the architecture mirror (`archRepo`, or the repo itself when no
   `archRepo` is given) for its `config.json` and safetensors parameter count.
2. Fetches the GGUF repo (`ggufRepo`, when one is given) and measures real file
   sizes for any quantisation whose files are present, summing split/sharded
   files (`quants.ts`).
3. Fills in every quantisation the app can price but no file was measured for,
   estimated from bits-per-weight (`quants.ts`'s `withEstimates`).
4. Assembles a `ModelSpec` (`assemble.ts`) and merges it with the previous
   `data/models.json` so a model whose content is unchanged keeps its old
   `fetchedAt` timestamp (`diff.ts`) — this keeps the commit log a reviewable
   diff instead of a timestamp-churn log every run.

## Running it

```
npm run ingest
```

This overwrites `data/models.json` in place (or prints `no change` if nothing
in the built output differs from what's on disk).

## Status: complete, verified, NOT yet run for real

The pipeline itself is finished and has been verified against the live Hugging
Face API. `data/models.json` is deliberately **not** regenerated from a real
run yet, for two reasons:

- **`"auto"` quant selection is undefined.** `src/lib/compat/evaluate.ts`
  resolves `quantId: "auto"` as the first quant the engine can load, with no
  check that it fits the hardware. That happens to work today only because
  the committed `data/models.json` lists a fitting quant first for every
  model in it. `withEstimates` here emits quants in `GGUF_BPW` order (highest
  precision first), and `pickQuant("auto")` in `evaluate.ts` depends on that
  same ordering — so a real run, which follows this ordering exactly, selects
  the largest (FP16) quant for every model via "auto". Against the current
  test fixtures that breaks 16 tests. What "auto" *should* mean — smallest
  that fits, best quality that fits, something else — is a product decision
  for a person to make, not something to redefine as a side effect of running
  this pipeline.
- **A real run drops non-GGUF quantisations.** `withEstimates` only emits ids
  from `GGUF_BPW`, i.e. GGUF quants. The committed `data/models.json` has an
  `AWQ-4bit` entry for Llama 3.1 8B Instruct that no config file can
  reproduce; a real run would silently drop it.
  `src/features/hardware/__tests__/HardwarePanel.test.tsx:78` and
  `src/features/report/__tests__/report.test.tsx:42,127` depend on that entry
  existing.

Both of these need to be resolved (defining "auto", and deciding what to do
about non-GGUF quants) before `npm run ingest` is safe to commit the output
of.

## Error handling convention

- `hfClient.ts` and `architecture.ts` throw `IngestError`, prefixed with the
  repo it concerns, and stop the whole run. A malformed API response or an
  unreadable `head_dim` cannot be worked around — a wrong guess here would be
  a confidently wrong answer, which this product exists to avoid.
- `quants.ts` and `assemble.ts` never throw. They drop the unusable input
  instead — an incomplete split, an unpriceable quant id — because a dropped
  quantisation is recoverable (the model still ships with its other quants)
  in a way a bad `head_dim` is not.
