import { IngestError } from "./hfClient";

function positiveInt(config: Record<string, unknown>, field: string, repo: string): number {
  const value = config[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new IngestError(
      `${repo}: config.json field ${field} is ${JSON.stringify(value)}, expected a positive integer`,
    );
  }
  return value;
}

/**
 * Fails loudly rather than defaulting (spec §12). A model whose architecture
 * cannot be read is a model that cannot be scored, and a plausible-looking
 * guess would produce a confident wrong answer — the one outcome this
 * product exists to avoid.
 */
export function readArchitecture(config: Record<string, unknown>, repo: string) {
  const numLayers = positiveInt(config, "num_hidden_layers", repo);
  const numKvHeads = positiveInt(config, "num_key_value_heads", repo);
  const maxContext = positiveInt(config, "max_position_embeddings", repo);

  const headDim =
    config.head_dim === undefined
      ? positiveInt(config, "hidden_size", repo) / positiveInt(config, "num_attention_heads", repo)
      : positiveInt(config, "head_dim", repo);

  if (!Number.isInteger(headDim)) {
    throw new IngestError(`${repo}: derived head_dim ${headDim} is not an integer`);
  }

  return { numLayers, numKvHeads, headDim, maxContext };
}
