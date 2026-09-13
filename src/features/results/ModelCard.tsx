import { memo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { VerdictPill } from "../../components/ui/Pill";
import { TightFitBadge } from "../../components/ui/TightFitBadge";
import { WhyNote } from "../../components/ui/WhyNote";
import { formatGB, formatParams, formatPercent, formatTokens } from "../../lib/ui/format";
import { modelPath } from "../../lib/ui/paths";
import type { ScoredModel } from "./useVerdicts";

/**
 * Memoised: filtering and sorting reorder and drop ScoredModel references but
 * never clone them, so a keystroke in the search box leaves every surviving
 * row's props referentially identical. At a few hundred models that is the
 * difference between re-rendering the whole list per character and re-rendering
 * none of it.
 */
export const ModelCard = memo(function ModelCard({
  row,
  vramBytes,
}: {
  row: ScoredModel;
  vramBytes: number;
}) {
  const { model, verdict } = row;

  return (
    <article className="verdict card" data-testid={`card-${model.id}`}>
      <div className="v-top">
        <Link className="v-name" to={modelPath(model)}>
          {model.displayName}
        </Link>
        <span className="v-arch">
          {formatParams(model.params)} · {model.arch.numLayers}L ·{" "}
          {model.arch.numKvHeads} KV heads
        </span>
        <span className="v-spacer" />
        <TightFitBadge verdict={verdict} vramBytes={vramBytes} />
        <Badge source={verdict.confidence} />
        <VerdictPill status={verdict.status} />
      </div>
      <div className="v-body">
        <div className="bar-head">
          <span>
            <b>{model.source.hfRepo.split("/")[0]}</b> · {verdict.quantId ?? "—"} · up to{" "}
            {formatTokens(model.arch.maxContext)} tokens
          </span>
          <span>
            <b>{formatGB(verdict.breakdown.totalBytes)}</b>
            {" · "}
            <b>{formatPercent(verdict.breakdown.totalBytes, vramBytes)}</b>
          </span>
        </div>
        <WhyNote note={verdict.notes[0]} />
      </div>
    </article>
  );
});
