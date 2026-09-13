import { Link } from "react-router-dom";
import { getEngine, type HardwareSpec, type Settings } from "../../lib/compat";
import { formatGB, formatTokens } from "../../lib/ui/format";

/**
 * States the machine a verdict was computed against. Any page that scores
 * models without showing the hardware form has to say this out loud — a
 * visitor who has set nothing is otherwise reading our defaults as facts
 * about their own machine.
 */
export function HardwareSummary({ hw, settings }: { hw: HardwareSpec; settings: Settings }) {
  return (
    <p className="hw-summary">
      <span className="label">Scored against</span>{" "}
      <span>
        {formatGB(hw.vramBytes)} VRAM · {formatGB(hw.ramBytes)} RAM ·{" "}
        {getEngine(settings.engine).label} · {formatTokens(settings.contextLength)} ctx
      </span>{" "}
      <Link to="/calculator">change →</Link>
    </p>
  );
}
