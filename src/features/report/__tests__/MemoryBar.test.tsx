import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { evaluate, GB } from "../../../lib/compat";
import { loadModels } from "../../../lib/data/load";
import { APPLE_HW, REFERENCE_HW, REFERENCE_SETTINGS } from "../../results/__tests__/fixtures";
import { MemoryBar } from "../MemoryBar";

const llama8b = loadModels().find((m) => m.id === "meta-llama/Llama-3.1-8B-Instruct")!;

describe("MemoryBar — no breakdown to draw", () => {
  it("shows an honest note instead of a bar of zeros when the verdict has no breakdown", () => {
    // vLLM has no Metal backend, so the engine guard rejects this model on
    // Apple Silicon before any memory arithmetic runs — a genuinely
    // null-breakdown verdict, produced by evaluate() itself rather than a
    // hand-written Verdict literal.
    const verdict = evaluate(llama8b, APPLE_HW, { ...REFERENCE_SETTINGS, engine: "vllm" });
    expect(verdict.breakdown).toBeNull();

    render(<MemoryBar verdict={verdict} vramBytes={APPLE_HW.vramBytes} />);

    // Reverting MemoryBar's null check back to destructuring
    // verdict.breakdown directly would throw here (null has no
    // .weightsBytes); reverting it to a zero-coalescing bar instead would
    // draw a bar reading "0 GB" — the exact all-zero-shape bug this task
    // fixed — so the bar and its zero-length segments must be absent.
    expect(screen.queryByTestId("memory-bar")).not.toBeInTheDocument();
    expect(screen.getByTestId("memory-bar-empty")).toBeInTheDocument();
  });

  it("still draws the real bar when the verdict did the arithmetic", () => {
    const verdict = evaluate(llama8b, REFERENCE_HW, REFERENCE_SETTINGS);
    expect(verdict.breakdown).not.toBeNull();

    render(<MemoryBar verdict={verdict} vramBytes={12 * GB} />);

    expect(screen.getByTestId("memory-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("memory-bar-empty")).not.toBeInTheDocument();
  });
});
