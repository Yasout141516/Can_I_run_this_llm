import { formatGB } from "../../lib/ui/format";
import type { Verdict } from "../../lib/compat";

/**
 * Drawn to the VRAM scale, so the free remainder is honest. When a model
 * needs more than the card holds, the scale is the larger of the two —
 * otherwise the bar would overflow its own container.
 */
export function MemoryBar({ verdict, vramBytes }: { verdict: Verdict; vramBytes: number }) {
  const { weightsBytes, kvCacheBytes, overheadBytes, totalBytes } = verdict.breakdown;
  const scale = Math.max(vramBytes, totalBytes);
  const pct = (n: number) => `${(n / scale) * 100}%`;
  const free = Math.max(0, vramBytes - totalBytes);

  return (
    <>
      <div
        className="bar"
        data-testid="memory-bar"
        role="img"
        aria-label={`Weights ${formatGB(weightsBytes)}, KV cache ${formatGB(kvCacheBytes)}, overhead ${formatGB(overheadBytes)}, of ${formatGB(vramBytes)} VRAM`}
      >
        <span data-testid="seg-weights" className="seg-w" style={{ width: pct(weightsBytes) }} />
        <span className="seg-k" style={{ width: pct(kvCacheBytes) }} />
        <span className="seg-o" style={{ width: pct(overheadBytes) }} />
        <span className="seg-r" style={{ width: pct(free) }} />
      </div>
      {/* Each value sits in its own element so it can be found by exact text,
          rather than being folded into a "Weights 4.92 GB" text node. */}
      <div className="legend">
        <span><i className="seg-w" /> Weights <b>{formatGB(weightsBytes)}</b></span>
        <span><i className="seg-k" /> KV cache <b>{formatGB(kvCacheBytes)}</b></span>
        <span><i className="seg-o" /> Overhead <b>{formatGB(overheadBytes)}</b></span>
        <span><i className="seg-t" /> Total <b>{formatGB(totalBytes)}</b></span>
      </div>
    </>
  );
}
