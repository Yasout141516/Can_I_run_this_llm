import { memo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { VerdictPill } from "../../components/ui/Pill";
import { TightFitBadge } from "../../components/ui/TightFitBadge";
import { formatGB, formatParamCount, formatPercent } from "../../lib/ui/format";
import { modelPath } from "../../lib/ui/paths";
import { emptyResultsMessage } from "./ResultsEmptyState";
import type { ScoredModel } from "./useVerdicts";

/** Memoised for the same reason as ModelCard — see the note there. */
const ModelTableRow = memo(function ModelTableRow({
  row,
  vramBytes,
}: {
  row: ScoredModel;
  vramBytes: number;
}) {
  const { model, verdict } = row;
  return (
    <tr>
      <th scope="row">
        <Link to={modelPath(model)}>{model.displayName}</Link>
      </th>
      <td>
        <span>{formatParamCount(model.params.total)}</span>
      </td>
      <td>
        <span>{verdict.quantId ?? "—"}</span>
      </td>
      <td>
        <span>{verdict.breakdown === null ? "—" : formatGB(verdict.breakdown.totalBytes)}</span>
      </td>
      <td>
        <span>
          {verdict.breakdown === null ? "—" : formatPercent(verdict.breakdown.totalBytes, vramBytes)}
        </span>
      </td>
      <td>
        <Badge source={verdict.confidence} />
      </td>
      <td>
        <TightFitBadge verdict={verdict} vramBytes={vramBytes} />
        <VerdictPill status={verdict.status} />
      </td>
      <td>{verdict.notes[0] ?? ""}</td>
    </tr>
  );
});

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
  const empty = emptyResultsMessage(rows, filtered);
  if (empty) return <p className="empty">{empty}</p>;

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
          {rows.map((row) => (
            <ModelTableRow key={row.model.id} row={row} vramBytes={vramBytes} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
