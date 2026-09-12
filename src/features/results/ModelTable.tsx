import { Link } from "react-router-dom";
import { VerdictPill } from "../../components/ui/Pill";
import { formatGB, formatPercent } from "../../lib/ui/format";
import type { ScoredModel } from "./useVerdicts";

export function ModelTable({ rows, vramBytes }: { rows: ScoredModel[]; vramBytes: number }) {
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
            <th scope="col">Verdict</th>
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
                <VerdictPill status={verdict.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
