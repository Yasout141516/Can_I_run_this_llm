import type { ModelSpec } from "../compat/types";

/**
 * Model ids contain a slash ("meta-llama/Llama-3.1-8B-Instruct"), so the id
 * has to be encoded or the route reads it as two segments. Built once here
 * because the card view and the table view both link to the same place.
 */
export function modelPath(model: Pick<ModelSpec, "id">): string {
  return `/model/${encodeURIComponent(model.id)}`;
}
