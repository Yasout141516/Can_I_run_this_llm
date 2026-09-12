import type { VerdictStatus } from "../../lib/compat";
import type { ScoredModel } from "./useVerdicts";

const TILES: { status: VerdictStatus; label: string; tone: string }[] = [
  { status: "run-on-gpu", label: "Run on GPU", tone: "var(--run)" },
  { status: "cpu-offloaded", label: "CPU offloaded", tone: "var(--offload)" },
  { status: "wont-run", label: "Won't run", tone: "var(--wont)" },
];

export function StatTiles({ rows }: { rows: ScoredModel[] }) {
  return (
    <div className="tiles">
      {TILES.map(({ status, label, tone }) => (
        <div
          key={status}
          className="tile"
          data-testid={`tile-${status}`}
          style={{ ["--tone" as string]: tone }}
        >
          <span className="n">{rows.filter((r) => r.verdict.status === status).length}</span>
          <span className="label">{label}</span>
        </div>
      ))}
    </div>
  );
}
