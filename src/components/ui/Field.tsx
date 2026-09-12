import type { ReactNode } from "react";
import { HelpDot } from "./HelpDot";

/**
 * The id of the description Field renders for a given control's `htmlFor`.
 * Exported so each call site can wire its own input/select up with
 * `aria-describedby={helpId(htmlFor)}` — Field renders `children` rather
 * than cloning them, so it cannot attach the attribute itself.
 */
export function helpId(htmlFor: string): string {
  return `${htmlFor}-help`;
}

export function Field({
  label,
  htmlFor,
  help,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="label lab" htmlFor={htmlFor}>
        {label}
        {help ? <HelpDot label={help} /> : null}
      </label>
      {children}
      {/* A description, not part of the name — announced after it, which is
          the right semantics for help text. Visually hidden: the "?" dot's
          title tooltip already carries this for sighted mouse users. */}
      {help && htmlFor ? (
        <span id={helpId(htmlFor)} className="sr-only">
          {help}
        </span>
      ) : null}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
