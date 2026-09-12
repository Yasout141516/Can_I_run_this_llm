import { DEFAULT_MEMORY_UTILIZATION } from "./memory";
import type { EngineId, ModelSpec, Settings, Verdict } from "./types";

function ollamaTag(model: ModelSpec, quantId: string): string {
  const name = model.displayName.toLowerCase().replace(/\s+/g, "-");
  return `${name}:${quantId}`;
}

function ggufFile(model: ModelSpec, quantId: string): string {
  const quant = model.quants.find((q) => q.id === quantId);
  return quant?.fileName ?? `${model.displayName.replace(/\s+/g, "-")}-${quantId}.gguf`;
}

type Template = (model: ModelSpec, settings: Settings, verdict: Verdict) => string;

const TEMPLATES: Record<EngineId, Template> = {
  ollama: (m, s, v) => `ollama run ${ollamaTag(m, v.quantId ?? s.quantId)}`,
  llamacpp: (m, s, v) =>
    `llama-cli -m ${ggufFile(m, v.quantId ?? s.quantId)} -c ${s.contextLength}` +
    ` --n-gpu-layers ${v.gpuLayers ?? m.arch.numLayers}`,
  koboldcpp: (m, s, v) =>
    `koboldcpp --model ${ggufFile(m, v.quantId ?? s.quantId)}` +
    ` --contextsize ${s.contextLength} --gpulayers ${v.gpuLayers ?? m.arch.numLayers}`,
  vllm: (m, s) =>
    `vllm serve ${m.source.hfRepo} --max-model-len ${s.contextLength}` +
    ` --gpu-memory-utilization ${DEFAULT_MEMORY_UTILIZATION}`,
  tgi: (m, s) =>
    `text-generation-launcher --model-id ${m.source.hfRepo}` +
    ` --max-total-tokens ${s.contextLength}`,
  sglang: (m, s) =>
    `python -m sglang.launch_server --model-path ${m.source.hfRepo}` +
    ` --context-length ${s.contextLength}`,
};

/** Returns null when there is nothing to run — a verdict of won't-run. */
export function runCommand(
  model: ModelSpec,
  settings: Settings,
  verdict: Verdict,
): string | null {
  if (verdict.status === "wont-run") return null;
  return TEMPLATES[settings.engine](model, settings, verdict);
}
