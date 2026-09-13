import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HardwarePanel } from "../HardwarePanel";
import { useHardwareForm } from "../../../hooks/useHardwareForm";

function Harness() {
  const form = useHardwareForm();
  return (
    <>
      <HardwarePanel form={form} />
      <output data-testid="vram">{form.hw.vramBytes}</output>
      <output data-testid="engine">{form.settings.engine}</output>
      <output data-testid="quant">{form.settings.quantId}</output>
      <output data-testid="ctx">{form.settings.contextLength}</output>
      <output data-testid="ram-type">{form.hw.ramType ?? ""}</output>
    </>
  );
}

describe("HardwarePanel", () => {
  it("offers every engine the compat module knows about", () => {
    render(<Harness />);
    const select = screen.getByLabelText(/inference engine/i);
    expect(select).toHaveDisplayValue("Ollama");
    expect(screen.getByRole("option", { name: "vLLM" })).toBeInTheDocument();
  });

  it("writes a manual VRAM edit straight into form state", async () => {
    render(<Harness />);
    const vram = screen.getByLabelText(/vram/i);
    await userEvent.clear(vram);
    await userEvent.type(vram, "24");
    expect(screen.getByTestId("vram")).toHaveTextContent("24000000000");
  });

  it("keeps a decimal VRAM value on screen instead of collapsing it to a whole number", async () => {
    render(<Harness />);
    const vram = screen.getByLabelText(/^vram/i);
    await userEvent.clear(vram);
    await userEvent.type(vram, "4.05");
    // Not "405": a naive guard would let "4." commit as 4, and resyncing
    // the display to a rounded echo of that would make the next digit land
    // after a value that had already snapped back to a whole number.
    expect(vram).toHaveValue(4.05);
    expect(screen.getByTestId("vram")).toHaveTextContent("4050000000");
  });

  it("keeps a rounding-boundary decimal like 4.5 on screen without snapping to a rounded whole number", async () => {
    // The deeper version of the same bug: rounding the domain value for
    // display (the old `Math.round(bytes / GB)`) makes 4.5 indistinguishable
    // from "whatever rounds to 4 or 5", so the resync effect would clobber
    // the draft with the rounded figure the instant 4.5 committed.
    render(<Harness />);
    const vram = screen.getByLabelText(/^vram/i);
    await userEvent.clear(vram);
    await userEvent.type(vram, "4.5");
    expect(vram).toHaveValue(4.5);
    expect(screen.getByTestId("vram")).toHaveTextContent("4500000000");
  });

  it("changes the engine", async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText(/inference engine/i), "vllm");
    expect(screen.getByTestId("engine")).toHaveTextContent("vllm");
  });

  it("offers only quantisations the selected engine can actually load", async () => {
    render(<Harness />);
    const quant = screen.getByLabelText(/quantisation/i);
    // Ollama is GGUF-only, so it must offer Q4_K_M and never the AWQ build.
    expect(within(quant).getByRole("option", { name: "Q4_K_M" })).toBeInTheDocument();
    expect(within(quant).queryByRole("option", { name: "AWQ-4bit" })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/inference engine/i), "vllm");
    // vLLM cannot load GGUF, so the offer must invert.
    expect(within(quant).queryByRole("option", { name: "Q4_K_M" })).not.toBeInTheDocument();
    expect(within(quant).getByRole("option", { name: "AWQ-4bit" })).toBeInTheDocument();
  });

  it("falls back to Auto when the chosen quant is not loadable by the new engine", async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText(/quantisation/i), "Q4_K_M");
    await userEvent.selectOptions(screen.getByLabelText(/inference engine/i), "vllm");
    expect(screen.getByTestId("quant")).toHaveTextContent("auto");
  });

  it("prefills from a laptop and still lets the user override RAM afterwards", async () => {
    render(<Harness />);
    await userEvent.selectOptions(
      screen.getByLabelText(/laptop/i),
      "macbook-pro-16-m3-max-64",
    );
    const ram = screen.getByLabelText(/system ram/i);
    expect(ram).toHaveValue(64);
    await userEvent.clear(ram);
    await userEvent.type(ram, "96");
    expect(ram).toHaveValue(96);
  });

  it("hides the VRAM input and shows the unified-memory figure for Apple Silicon", async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText(/device type/i), "apple-silicon");
    expect(screen.queryByLabelText(/^vram/i)).not.toBeInTheDocument();
    // Default RAM is 32 GB; usableVram() reserves 75% of it for the GPU.
    expect(screen.getByText(/unified memory/i)).toHaveTextContent("24.00 GB");
  });

  it("hides the VRAM input for a CPU-only machine", async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText(/device type/i), "cpu-only");
    expect(screen.queryByLabelText(/^vram/i)).not.toBeInTheDocument();
    // Scoped by test id: the device-type field's own help sentence also
    // mentions "no GPU", so an unscoped text match finds two hits.
    expect(screen.getByTestId("no-gpu-note")).toHaveTextContent(/no gpu/i);
  });

  it("clears a stale ramType when a discrete GPU is applied after a MacBook preset", async () => {
    render(<Harness />);
    await userEvent.selectOptions(
      screen.getByLabelText(/laptop/i),
      "macbook-pro-16-m3-max-64",
    );
    expect(screen.getByTestId("ram-type")).toHaveTextContent("unified");
    await userEvent.selectOptions(screen.getByLabelText(/graphics card/i), "rtx-4090");
    expect(screen.getByTestId("ram-type")).toHaveTextContent("");
  });

  it("ignores a cleared context field instead of coercing it to 0", async () => {
    render(<Harness />);
    const ctx = screen.getByLabelText(/context length/i);
    expect(screen.getByTestId("ctx")).toHaveTextContent("8192");
    await userEvent.clear(ctx);
    expect(screen.getByTestId("ctx")).toHaveTextContent("8192");
  });

  it("ignores malformed context text rather than writing NaN", async () => {
    render(<Harness />);
    const ctx = screen.getByLabelText(/context length/i);
    await userEvent.clear(ctx);
    // Never a valid numeric prefix at any point while typing, unlike "1e"
    // (whose leading "1" legitimately commits before the "e" breaks it) —
    // this exercises the NaN guard specifically, not the blank guard.
    await userEvent.type(ctx, "abc");
    expect(screen.getByTestId("ctx")).toHaveTextContent("8192");
  });

  it("gives each control a description separate from its accessible name", () => {
    render(<Harness />);
    expect(
      screen.getByRole("combobox", {
        name: "Inference engine",
        description:
          "Decides which quantised formats are offered and whether the model can offload into ordinary memory.",
      }),
    ).toBeInTheDocument();
    // A second control, and one from DeviceLookup rather than HardwarePanel
    // itself, to show the fix is in the shared Field/HelpDot plumbing and not
    // a one-off patch on a single input.
    expect(
      screen.getByRole("combobox", {
        name: "Quantisation",
        description:
          "Smaller formats shrink the weights at some cost to quality. Only formats your engine can load are offered.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: "Graphics card",
        description: "Pick your card to fill in its video memory. Not listed? Type it in yourself.",
      }),
    ).toBeInTheDocument();
  });
});
