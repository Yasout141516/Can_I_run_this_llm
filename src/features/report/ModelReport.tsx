import { Link, useParams } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { VerdictPill } from "../../components/ui/Pill";
import { evaluate, getEngine, runCommand, usableVram } from "../../lib/compat";
import { loadModels } from "../../lib/data/load";
import { formatTokens } from "../../lib/ui/format";
import { useHardwareContext } from "../../hooks/useHardwareForm";
import { MemoryBar } from "./MemoryBar";
import { QuantTable } from "./QuantTable";
import { RunItBlock } from "./RunItBlock";

/**
 * The report reads the hardware the user configured on the calculator, not a
 * fresh default — useHardwareContext() shares the same form state that
 * HardwareProvider holds for the whole app, so a 24 GB card set on the
 * calculator is still 24 GB here.
 */
export function ModelReport() {
  const { id } = useParams();
  const { hw, settings } = useHardwareContext();
  const model = loadModels().find((m) => m.id === decodeURIComponent(id ?? ""));

  if (!model) {
    return (
      <main className="wrap">
        <p className="empty">
          That model is not tracked. <Link to="/calculator">Back to the calculator</Link>.
        </p>
      </main>
    );
  }

  const verdict = evaluate(model, hw, settings);
  const vram = usableVram(hw);
  const command = runCommand(model, settings, verdict);

  return (
    <main className="wrap">
      <Link className="label" to="/calculator">← Back to all models</Link>

      <header className="mast" data-testid="report-masthead" aria-label="Model summary">
        <div>
          <h1>{model.displayName}</h1>
          <p className="v-arch">
            {model.arch.numLayers} layers · {model.arch.numKvHeads} KV heads · up to{" "}
            {formatTokens(model.arch.maxContext)} tokens
          </p>
        </div>
        <div className="mast-side">
          <Badge source={verdict.confidence} />
          <VerdictPill status={verdict.status} />
        </div>
      </header>

      <section className="panel" data-testid="memory-panel" aria-label="Memory usage">
        <MemoryBar verdict={verdict} vramBytes={vram} />
        {verdict.notes[0] ? (
          <p className="why">
            <b>Why</b> <span>{verdict.notes[0]}</span>
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2 className="label">Every quantisation on your hardware</h2>
        <QuantTable model={model} hw={hw} settings={settings} vramBytes={vram} />
      </section>

      {command ? (
        <RunItBlock command={command} engineLabel={getEngine(settings.engine).label} />
      ) : null}
    </main>
  );
}
