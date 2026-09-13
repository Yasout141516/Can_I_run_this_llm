# Handoff: LLM Hardware Compatibility Checker

Planning happened in Cowork; building continues in Claude Code. This doc captures every decision made so far so nothing has to be re-derived. Nothing has been built yet — no code exists. Per Yasin's stated working preferences, Claude Code should re-confirm the system design/plan with him before writing code, keep planning visible throughout implementation, and pause before any web search, external API fetch, or mutating action rather than doing these autonomously.

## 1. What this is

A web app, inspired by runthisllm.com and llmrun.dev, that tells a user whether a given LLM will run on their hardware. User supplies (or looks up) their specs and inference settings; the app categorizes models as **Run on GPU**, **CPU Offloaded**, or **Won't Run**.

## 2. Reference sites — findings (not methodology, both are closed-box on the math)

**runthisllm.com**: two modes ("I have hardware, what can I run" / "I have a model, what do I need"), ~295+ models, category filter chips (General/Code/Reasoning/Vision/Medical/Finance/Legal/etc.), sort by compatibility/size/tokens-per-sec/benchmark (MMLU, HumanEval, MATH, GPQA, SWE-Bench Pro, Terminal-Bench, HLE, MTEB, BEIR, GenEval, VBench), top stat tiles (counts of run/offload/won't-run), cards/table view toggle, click-through to a full spec report per model. No published methodology.

**llmrun.dev**: ~1,128 models, hardware directory organized by VRAM tier (8/12/16/24/32GB+) that includes **GPUs, MacBooks, and "AI devices"** (not just GPUs) — validates broadening our "device lookup" beyond desktop GPUs to laptops/Macs. Has a benchmarks page. "How it works" flow: Select Hardware → Check Compatibility (with a performance grade, e.g. "91 excellent, 15 good" within a tier) → Run It (names the actual tool, e.g. Ollama/LM Studio) — worth adopting: after a model fits, tell the user the actual command/config to run it on their chosen engine. Confirmed quantization example ("7B ≈14GB at FP16, ≈4GB at Q4_K_M") lines up with the bits-per-weight math below.

## 3. Decided architecture

- **Static frontend only. No backend/server for the app itself.** Confirmed explicitly by Yasin.
- **The one exception: a local spec-detection script**, run by the user on their own machine (not browser-based detection — browser APIs for VRAM/RAM were explicitly rejected as unreliable).
- Model data, GPU database, and laptop database are all static JSON bundled with the frontend.
- **Open/unconfirmed idea (needs Yasin's sign-off, not yet agreed):** to still get "refreshed every ~2 days" data without a live backend, use a CI scheduled job (e.g. GitHub Actions `schedule:` cron) that fetches HF updates + runs the laptop scraper, writes updated JSON into the repo, and triggers a static redeploy. This was proposed to reconcile his original "cron job" ask with the later "no backend" constraint, but he hadn't confirmed it before the handoff — surface this explicitly before assuming it's the plan.
- Tech stack (Vite+React vs Next.js vs plain HTML/JS): explicitly deferred by Yasin ("later") — not decided.

## 4. Data model

### Model entry (needed for the compatibility math, not just display)
- total parameters; for MoE models, **active** parameters tracked separately (total params drive memory footprint since all experts must be resident; active params only affect speed)
- num_layers, num_attention_heads, num_kv_heads (GQA models have far fewer KV heads than query heads — big effect on KV cache size), head_dim
- max supported context length
- available quantization levels / real file sizes where known (esp. from GGUF repos — more accurate than estimating)
- benchmark scores (MMLU, HumanEval, GPQA, etc. — per Yasin's benchmarks-page ask)
- category tags (chat/code/reasoning/vision/etc.) for filtering

**Model list curation, decided:** not full Hugging Face auto-discovery (too much fine-tune noise). Instead, track a **fixed list of model families that Yasin maintains/supplies himself** (e.g. specific HF orgs/repos). The ingestion job (wherever it ends up running) checks each tracked family for new/updated checkpoints and pulls `config.json` for the real architecture numbers. Still open: whether the family list is a config file Yasin edits by hand, or something addable through the app later.

### GPU/device entry
- name, VRAM, ideally memory bandwidth (for future speed estimates)
- searchable/autocomplete by name; if not found, user always falls back to manual VRAM entry

### Laptop entry
- laptop name → GPU model, VRAM, RAM, RAM type, all auto-filled instantly from this preset on lookup
- **manual override of GPU and RAM must always remain available** regardless of laptop preset (explicit requirement)
- **Data source unresolved.** No public API exists for this (unlike HF for models). Candidates raised but not evaluated: manufacturer spec pages, retailer product listings (Newegg/Best Buy/Amazon), or an aggregator/review site (NotebookCheck-style). Each has different scraping difficulty/ToS exposure — needs actual research before committing, which requires web access approval first.

## 5. Calculation logic

### Weight size
`weight_size_GB = total_params × bits_per_weight(quant) / 8 / 1e9`

Approximate bits-per-weight table (GGUF-style k-quants aren't a clean single value per format since blocks mix precision — these are commonly-cited approximations):
- FP16/BF16: 16
- Q8_0: ~8.5
- Q6_K: ~6.6
- Q5_K_M: ~5.7
- Q4_K_M: ~4.8
- Q4_0: ~4.5
- Q3_K_M: ~3.9
- Q2_K: ~2.6

vLLM/TGI/SGLang-style formats (AWQ/GPTQ/FP8/INT8) need a separate, smaller table since they're not GGUF k-quants.

### KV cache size
`kv_cache_bytes = 2 × num_layers × num_kv_heads × head_dim × context_length × bytes_per_element(kv_precision)`
where bytes_per_element is fp16=2, q8=1, q4=0.5. This is why GQA architecture (fewer KV heads) matters so much for long-context feasibility.

### Engine-specific behavior (this is why "which inference engine" is a required input, not cosmetic)
- **Ollama / KoboldCpp / llama.cpp (GGUF)**: supports layer-by-layer CPU+GPU split — doesn't fit VRAM ≠ can't run, it can spill to system RAM (slower). This is the "CPU Offloaded" bucket.
- **vLLM / TGI / SGLang**: expects the full model in GPU VRAM in normal use (no real CPU offload path), uses AWQ/GPTQ/FP8/INT8 rather than GGUF quant levels, and vLLM specifically pre-reserves a KV cache block pool sized off a memory-utilization fraction rather than growing dynamically.

### Categorization
- **Run on GPU**: weights + KV cache + engine overhead ≤ VRAM
- **CPU Offloaded**: doesn't fit VRAM alone, but engine supports offload AND (VRAM + system RAM) is enough
- **Won't Run**: exceeds VRAM+RAM even with offload, or engine doesn't support offload and it doesn't fit VRAM alone

### Deferred / stretch
A rough tokens/sec estimate via a memory-bandwidth heuristic (single-batch decode is generally bandwidth-bound: `tokens/s ≈ effective_memory_bandwidth / model_size_bytes`) was discussed as a v2/stretch item, not core — accuracy is inherently fuzzier than the fit/no-fit logic. **v1 scope was never fully pinned down** — Yasin deferred that scoping question once, then separately asked for a benchmarks page, which leans toward a fuller v1 than "bare minimum calculator." Confirm actual v1 cut line before locking a build plan.

## 6. Features as currently scoped

1. Input form: GPU VRAM, system RAM, RAM type, inference engine (Ollama/KoboldCpp/vLLM/TGI/SGLang), context length (2k up to model max), KV cache precision (fp16/q8/q4), quantization (q4/q8/fp16/etc.)
2. **Local spec-detection script** (not browser-based): a script the user downloads and runs locally to query real GPU model+VRAM (`nvidia-smi`/`rocm-smi`/`system_profiler`), RAM size/type/speed (`wmic memorychip`/`system_profiler SPMemoryDataType`/`dmidecode`/`/proc/meminfo`), and CPU model. Note: Windows' WMI-based VRAM reporting is known to be unreliable above ~4GB — prefer `nvidia-smi` where available. Output is a compact JSON/text summary the user pastes into the site to pre-fill the form (chosen over a local server/localhost bridge to avoid extra complexity and antivirus-flag risk).
3. **Device/GPU lookup**: search by name against the bundled GPU database, auto-fills VRAM; manual entry always available if not found.
4. **Laptop lookup**: search by laptop name, auto-fills GPU/VRAM/RAM/RAM type instantly from the pre-built (not live-scraped-on-request) database; GPU/RAM stay manually overridable always.
5. Model browsing: category filter chips, sort by compatibility/size/tokens-per-sec/benchmarks, filter box, cards/table toggle, per-model detail view.
6. **Benchmarks**: benchmark scores per model, own page/section, sortable/filterable (per Yasin's explicit ask, inspired by llmrun.dev).
7. **"Run it" step** (borrowed idea from llmrun.dev, not yet explicitly confirmed by Yasin): once a model is shown as compatible, surface the actual run command/config for the selected engine.

## 7. Open questions to resolve with Yasin before/while building

- Confirm the CI-scheduled-regeneration approach (§3) actually matches what he wants for "cron without a backend," or find out what he meant instead.
- How the model-family list gets maintained (hand-edited config file vs. in-app addition).
- Laptop data source — needs research (web access) before it can be chosen; get his go-ahead first, per his standing preference to approve web/API access before it happens.
- Actual v1 cut line: bare compatibility calculator vs. + speed estimates vs. + benchmarks/full parity with the reference sites — never explicitly pinned down, only inferred.
- Frontend tech stack — explicitly deferred, still needs a decision.
- Whether the "Run it" step is wanted or was just a note-worthy idea from research.
