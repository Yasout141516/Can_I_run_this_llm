/**
 * A purely decorative affordance — the "?" a mouse user hovers for a native
 * title tooltip. It must never carry the help text as its accessible name:
 * a descendant's aria-label folds into whatever control the surrounding
 * <label> names, so the field would announce as "Inference engine <whole
 * help sentence>" instead of just "Inference engine". aria-hidden removes it
 * from the accessible tree entirely; Field associates the real description
 * separately, via aria-describedby.
 */
export function HelpDot({ label }: { label: string }) {
  return (
    <span className="help" aria-hidden="true" title={label}>
      ?
    </span>
  );
}
