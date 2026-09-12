import type { ReactNode } from "react";
import { HelpDot } from "./HelpDot";

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
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
