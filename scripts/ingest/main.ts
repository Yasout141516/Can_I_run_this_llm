import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import benchmarksJson from "../../config/benchmarks.json";
import familiesJson from "../../config/families.json";
import type { BenchmarkId, ModelSpec } from "../../src/lib/compat/types";
import { SCHEMA_VERSION, familiesFileSchema, modelsFileSchema } from "../../src/lib/data/schema";
import { assembleModel } from "./assemble";
import { isUnchanged, mergePreservingTimestamps } from "./diff";
import { IngestError, fetchConfigJson, fetchModelInfo } from "./hfClient";

const OUT = new URL("../../data/models.json", import.meta.url);

const BENCHMARK_IDS = [
  "mmlu", "mmlu_pro", "gpqa", "humaneval", "math", "ifeval", "swe_bench",
] as const satisfies readonly BenchmarkId[];

/**
 * `_source` documents where a curated score came from (spec §6) but must
 * never leak into data/models.json, so the schema below only validates it
 * is present as a string — the extraction loop afterwards never reads it.
 */
const curatedScoreSchema = z.object({
  mmlu: z.number().nullable(),
  mmlu_pro: z.number().nullable(),
  gpqa: z.number().nullable(),
  humaneval: z.number().nullable(),
  math: z.number().nullable(),
  ifeval: z.number().nullable(),
  swe_bench: z.number().nullable(),
  _source: z.string(),
});

const benchmarksFileSchema = z.object({
  _note: z.string(),
  scores: z.record(z.string(), curatedScoreSchema),
});

const curated = benchmarksFileSchema.parse(benchmarksJson).scores;

/** Never spreads `_source` in: every key copied out is named explicitly. */
function scoresFor(hfRepo: string): Partial<Record<BenchmarkId, number | null>> {
  const entry = curated[hfRepo];
  const scores: Partial<Record<BenchmarkId, number | null>> = {};
  if (!entry) return scores;
  for (const id of BENCHMARK_IDS) {
    scores[id] = entry[id];
  }
  return scores;
}

async function main() {
  const { families } = familiesFileSchema.parse(familiesJson);
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
        benchmarks: scoresFor(hfRepo),
        fetchedAt,
      });
      built.push(model);
      const measured = model.quants.filter((q) => q.sizeSource === "measured").length;
      console.log(`ok ${hfRepo} — ${measured} measured quantisations`);
    }
  }

  const existing = readFileSync(OUT, "utf8");
  const previous = modelsFileSchema.parse(JSON.parse(existing));
  const file = {
    schemaVersion: SCHEMA_VERSION,
    models: mergePreservingTimestamps(built, previous.models),
  };

  // Validate before writing: a file that fails the app's own schema must
  // never reach disk, because the app throws on load rather than degrading.
  modelsFileSchema.parse(file);

  const serialised = JSON.stringify(file, null, 2) + "\n";
  if (isUnchanged(existing, serialised)) {
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
