import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { VerdictPill } from "../components/ui/Pill";
import { HardwareSummary } from "../features/hardware/HardwareSummary";
import { ModelList } from "../features/results/ModelList";
import { sortRows } from "../features/results/sort";
import { useVerdicts } from "../features/results/useVerdicts";
import { useHardwareContext } from "../hooks/useHardwareForm";
import { usableVram, type VerdictStatus } from "../lib/compat";
import { loadModels } from "../lib/data/load";

/** Enough to show the shape of an answer without becoming the results page. */
const BEST_FITS = 6;

/**
 * The front door: what the three verdicts mean, then the models that fit the
 * hardware we are scoring against — with that hardware named, since a visitor
 * who has set nothing is looking at our defaults.
 */
const LEGEND: { status: VerdictStatus; meaning: string }[] = [
  {
    status: "run-on-gpu",
    meaning: "Weights, KV cache and overhead all fit in your VRAM. Full speed.",
  },
  {
    status: "cpu-offloaded",
    meaning: "Some layers spill to system RAM. It runs, slower — we say how many layers.",
  },
  {
    status: "wont-run",
    meaning: "Not even offloaded: your RAM and VRAM together are short. We say by how much.",
  },
];

export function WelcomePage() {
  const { hw, settings } = useHardwareContext();
  const rows = useVerdicts(loadModels(), hw, settings);
  const best = useMemo(() => sortRows(rows, "compatibility").slice(0, BEST_FITS), [rows]);

  return (
    <main className="wrap welcome">
      <header className="mast">
        <div>
          <div className="label eyebrow">Will it run?</div>
          <h1>Runcheck</h1>
          <p>
            Tell it what you have. It tells you what you can run, and the arithmetic behind
            every answer.
          </p>
        </div>
      </header>

      <section className="panel legend-panel" aria-label="What the verdicts mean">
        <h2 className="label">Three answers</h2>
        <ul className="legend-list">
          {LEGEND.map(({ status, meaning }) => (
            <li key={status}>
              <VerdictPill status={status} />
              <span>{meaning}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="btn-row">
        <Button to="/calculator">
          Check my hardware <span aria-hidden="true">→</span>
        </Button>
      </div>

      <section className="best-fits" aria-label="Best fits">
        <h2 className="label">Best fits for your hardware</h2>
        <HardwareSummary hw={hw} settings={settings} />
        <ModelList rows={best} vramBytes={usableVram(hw)} filtered={false} />
        <Link className="label more-link" to="/browse">
          Browse all models →
        </Link>
      </section>

      <p className="welcome-note">
        Nothing here is a black box: every verdict shows the weights, the KV cache, the
        overhead and what is left over, so you can check the answer rather than trust it.
      </p>
    </main>
  );
}
