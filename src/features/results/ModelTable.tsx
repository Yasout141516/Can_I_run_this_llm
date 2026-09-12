import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { VerdictPill } from "../../components/ui/Pill";
import { formatGB, formatPercent } from "../../lib/ui/format";
import { emptyResultsMessage, ResultsEmptyState } from "./ResultsEmptyState";
import { isTightFit, type ScoredModel } from "./useVerdicts";

export function ModelTable({
  rows,
  vramBytes,
  filtered,
}: {
  rows: ScoredModel[];
  vramBytes: number;
  /** See ModelList — the table must not go blank-with-no-explanation on the
   * exact same dead ends the card view already handles. */
  filtered: boolean;
}) {
  if (emptyResultsMessage(rows, filtered)) {
    return <ResultsEmptyState rows={rows} filtered={filtered} />;
  }

  return (
    <div data-testid="table-scroll" style={{ overflowX: "auto" }}>
      <table className="model-table">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Params</th>
            <th scope="col">Quant</th>
            <th scope="col">Needs</th>
            <th scope="col">Of your VRAM</th>
            <th scope="col">Size source</th>
            <th scope="col">Verdict</th>
            <th scope="col">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ model, verdict }) => (
            <tr key={model.id}>
              <th scope="row">
                <Link to={`/model/${encodeURIComponent(model.id)}`}>{model.displayName}</Link>
              </th>
              <td>
                <span>{(model.params.total / 1e9).toFixed(1)}B</span>
              </td>
              <td>
                <span>{verdict.quantId ?? "—"}</span>
              </td>
              <td>
                <span>{formatGB(verdict.breakdown.totalBytes)}</span>
              </td>
              <td>
                <span>{formatPercent(verdict.breakdown.totalBytes, vramBytes)}</span>
              </td>
              <td>
                <Badge source={verdict.confidence} />
              </td>
              <td>
                {isTightFit(verdict, vramBytes) ? (
                  <span className="badge tight" title="Fits, but with almost no headroom left">
                    Tight fit
                  </span>
                ) : null}
                <VerdictPill status={verdict.status} />
              </td>
              <td>{verdict.notes[0] ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
