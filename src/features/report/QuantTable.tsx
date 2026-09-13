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
            // one — return before any memory arithmetic runs at all: "engine"
            // (this engine has no backend for this hardware at all, e.g.
            // vLLM on Apple Silicon) is exactly as unevaluated as "format".
            // A null breakdown is the verdict stating that fact plainly,
            // rather than the UI inferring it from an all-zero shape.
            return (
              <tr key={q.id}>
                <th scope="row">{q.id}</th>
                <td>{q.format}</td>
                <td>{v.breakdown === null ? "—" : formatGB(v.breakdown.totalBytes)}</td>
                <td>{v.breakdown === null ? "—" : formatPercent(v.breakdown.totalBytes, vramBytes)}</td>
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
