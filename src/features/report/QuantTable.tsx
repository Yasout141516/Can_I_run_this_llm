import { Badge } from "../../components/ui/Badge";
import { VerdictPill } from "../../components/ui/Pill";
import { evaluate, type HardwareSpec, type ModelSpec, type Settings } from "../../lib/compat";
import { formatGB, formatPercent } from "../../lib/ui/format";

/**
 * One row per quantisation the model actually ships, each scored against the
 * same hardware — so "what would Q4 buy me?" is answered without the user
 * changing anything. Every number comes from evaluate(); nothing here is
 * approximated.
 */
export function QuantTable({
  model,
  hw,
  settings,
  vramBytes,
}: {
  model: ModelSpec;
  hw: HardwareSpec;
  settings: Settings;
  vramBytes: number;
}) {
  return (
    <div data-testid="quant-table" style={{ overflowX: "auto" }}>
      <table className="model-table">
        <thead>
          <tr>
            <th scope="col">Quantisation</th>
            <th scope="col">Format</th>
            <th scope="col">Needs</th>
            <th scope="col">Of your VRAM</th>
            <th scope="col">Size source</th>
            <th scope="col">Verdict</th>
            <th scope="col">Why</th>
          </tr>
        </thead>
        <tbody>
          {model.quants.map((q) => {
            const v = evaluate(model, hw, { ...settings, quantId: q.id });
            // Several wont-run guards in evaluate() — not just the "format"
            // one — hand back an all-zero breakdown as a placeholder rather
            // than a real measurement: "engine" (this engine has no backend
            // for this hardware at all, e.g. vLLM on Apple Silicon) is
            // exactly as fabricated as "format". Keying off "no real
            // breakdown was computed" covers every such guard, present or
            // future, instead of enumerating them one at a time. Printing
            // "0 MB · 0%" would tell the user the model needs nothing and
            // still won't run, which is worse than printing nothing.
            const noBreakdown = v.status === "wont-run" && v.breakdown.totalBytes === 0;
            return (
              <tr key={q.id}>
                <th scope="row">{q.id}</th>
                <td>{q.format}</td>
                <td>{noBreakdown ? "—" : formatGB(v.breakdown.totalBytes)}</td>
                <td>{noBreakdown ? "—" : formatPercent(v.breakdown.totalBytes, vramBytes)}</td>
                <td><Badge source={q.sizeSource} /></td>
                <td><VerdictPill status={v.status} /></td>
                <td>{v.notes[0] ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
