import { useState } from "react";

/** How long the "Copied" acknowledgement stays up before reverting to "Copy". */
const COPIED_RESET_MS = 1400;

export function RunItBlock({ command, engineLabel }: { command: string; engineLabel: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <section className="runit" data-testid="run-it" aria-label="Run this model">
      <div className="runit-head">
        <span className="label">Run this model</span>
        <button
          type="button"
          className="copy"
          onClick={() => {
            void navigator.clipboard?.writeText(command);
            setCopied(true);
            window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <span className="engine">{engineLabel}</span>
      </div>
      <pre>{command}</pre>
    </section>
  );
}
