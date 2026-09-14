import type { BenchmarkId, Category, ModelSpec } from "../../src/lib/compat/types";
import { readArchitecture } from "./architecture";
import type { HfSibling } from "./hfClient";
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
  siblings: HfSibling[];
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
