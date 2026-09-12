import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { VerdictPill } from "../../components/ui/Pill";
import { formatGB, formatPercent, formatTokens } from "../../lib/ui/format";
import { isTightFit, type ScoredModel } from "./useVerdicts";

export function ModelCard({ row, vramBytes }: { row: ScoredModel; vramBytes: number }) {
  const { model, verdict } = row;
  const moe = model.params.active !== null;

  return (
    <article className="verdict card" data-testid={`card-${model.id}`}>
      <div className="v-top">
        <Link className="v-name" to={`/model/${encodeURIComponent(model.id)}`}>
          {model.displayName}
        </Link>
        <span className="v-arch">
          {moe
            ? `${(model.params.total / 1e9).toFixed(0)}B total / ${(model.params.active! / 1e9).toFixed(0)}B active · MoE`
            : `${(model.params.total / 1e9).toFixed(1)}B dense`}{" "}
          · {model.arch.numLayers}L · {model.arch.numKvHeads} KV heads
        </span>
        <span className="v-spacer" />
        {isTightFit(verdict, vramBytes) ? (
          <span className="badge tight" title="Fits, but with almost no headroom left">
            Tight fit
          </span>
        ) : null}
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
        {verdict.notes[0] ? (
          <p className="why">
            <b>Why</b> <span>{verdict.notes[0]}</span>
          </p>
        ) : null}
      </div>
    </article>
  );
}
