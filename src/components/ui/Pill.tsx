import type { VerdictStatus } from "../../lib/compat";

const PRESENTATION: Record<VerdictStatus, { text: string; glyph: string; tone: string }> = {
  "run-on-gpu": { text: "Run on GPU", glyph: "●", tone: "var(--run)" },
  "cpu-offloaded": { text: "CPU offloaded", glyph: "▲", tone: "var(--offload)" },
  "wont-run": { text: "Won't run", glyph: "✗", tone: "var(--wont)" },
};

export function VerdictPill({ status }: { status: VerdictStatus }) {
  const { text, glyph, tone } = PRESENTATION[status];
  return (
    <span className="pill" style={{ background: tone }}>
      <span data-testid="verdict-glyph" aria-hidden="true">{glyph}</span>
      {text}
    </span>
  );
}
