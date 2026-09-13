import { memo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import type { ModelSpec } from "../../lib/compat";
import { formatGB, formatParams, formatTokens } from "../../lib/ui/format";
import { modelPath } from "../../lib/ui/paths";
import { smallestQuantBytes } from "../results/sort";

/** The cheapest quant a model ships, with the provenance of that number. */
function smallestQuant(model: ModelSpec) {
  return model.quants.reduce((a, b) => (b.sizeBytes < a.sizeBytes ? b : a));
}

const CatalogRow = memo(function CatalogRow({ model }: { model: ModelSpec }) {
  const quant = smallestQuant(model);
  return (
    <tr>
      <th scope="row">
        <Link to={modelPath(model)}>{model.displayName}</Link>
      </th>
      <td>{model.family}</td>
      <td>{formatParams(model.params)}</td>
      <td>{model.arch.numLayers}</td>
      <td>{formatTokens(model.arch.maxContext)}</td>
      <td>
        {quant.id} · {formatGB(smallestQuantBytes(model))} <Badge source={quant.sizeSource} />
      </td>
      <td>{model.categories.join(", ")}</td>
    </tr>
  );
});

/**
 * The catalogue: what each model *is*, with no reference to your hardware.
 * Whether it runs is the calculator's question, and the report's.
 */
export function CatalogTable({ models }: { models: ModelSpec[] }) {
  if (models.length === 0) {
    return <p className="empty">No models match those filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="model-table">
        <caption className="sr-only">Every tracked model and its specifications</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Family</th>
            <th scope="col">Parameters</th>
            <th scope="col">Layers</th>
            <th scope="col">Max context</th>
            <th scope="col">Smallest quant</th>
            <th scope="col">Categories</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <CatalogRow key={model.id} model={model} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
