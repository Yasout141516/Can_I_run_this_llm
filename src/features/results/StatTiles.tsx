import type { VerdictStatus } from "../../lib/compat";
import type { ScoredModel } from "./useVerdicts";

// Distinct wording from VerdictPill's per-model text ("Run on GPU", "CPU
// offloaded", "Won't run") is deliberate: this tile is an aggregate category
// count, not a verdict statement, and the two must never share an exact
// string — a page showing both at once would otherwise have two elements
// with identical text, which is ambiguous for anyone (person or test) trying
// to point at "the one that says Run on GPU".
const TILES: { status: VerdictStatus; label: string; tone: string }[] = [
  { status: "run-on-gpu", label: "On GPU", tone: "var(--run)" },
  { status: "cpu-offloaded", label: "Offloaded", tone: "var(--offload)" },
  { status: "wont-run", label: "Won't fit", tone: "var(--wont)" },
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
