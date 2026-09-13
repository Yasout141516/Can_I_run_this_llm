import { Link } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * The pixel design's button: a 3px border over a hard offset shadow that the
 * press pushes 4px into, in two discrete steps rather than a glide.
 *
 * It renders an anchor because its only consumer is a call to action that goes
 * somewhere — a destination you can middle-click, copy or open in a new tab is
 * not an onClick. If a button that *does* something rather than goes somewhere
 * ever appears (the coach-mark tour's Next/Back), give this file a sibling
 * rather than smuggling a <button> in behind the same name.
 */
export function Button({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="btn btn-primary" to={to}>
      {children}
    </Link>
  );
}
