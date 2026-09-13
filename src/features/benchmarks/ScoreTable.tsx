import { memo } from "react";
import { Link } from "react-router-dom";
import type { ModelSpec } from "../../lib/compat";
import { modelPath } from "../../lib/ui/paths";
import { BENCHMARKS } from "./benchmarkMeta";

/**
 * A score the vendor never published is an em dash, never a zero: "did not
 * report" and "scored nothing" are different claims, and only one of them is
 * true here.
 */
function formatScore(value: number | null | undefined): string {
  return typeof value === "number" ? value.toFixed(1) : "—";
}

const ScoreRow = memo(function ScoreRow({ model }: { model: ModelSpec }) {
  return (
    <tr>
      <th scope="row">
        <Link to={modelPath(model)}>{model.displayName}</Link>
      </th>
      {BENCHMARKS.map(({ id }) => (
        <td key={id}>{formatScore(model.benchmarks[id])}</td>
      ))}
    </tr>
  );
});

export function ScoreTable({ models }: { models: ModelSpec[] }) {
  if (models.length === 0) {
    return <p className="empty">No models match those filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="model-table">
        <caption className="sr-only">Benchmark scores for every tracked model</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            {BENCHMARKS.map(({ id, label }) => (
              <th scope="col" key={id}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <ScoreRow key={model.id} model={model} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
