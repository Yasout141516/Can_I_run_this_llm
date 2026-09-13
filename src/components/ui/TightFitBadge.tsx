import { isTightFit } from "../../features/results/useVerdicts";
import type { Verdict } from "../../lib/compat";

/**
 * Renders nothing unless the model fits with almost no headroom. Amber, not
 * green, because it is a warning sitting beside the verdict pill rather than
 * a competing verdict.
 */
export function TightFitBadge({ verdict, vramBytes }: { verdict: Verdict; vramBytes: number }) {
  if (!isTightFit(verdict, vramBytes)) return null;
  return (
    <span className="badge tight" title="Fits, but with almost no headroom left">
      Tight fit
    </span>
  );
}
