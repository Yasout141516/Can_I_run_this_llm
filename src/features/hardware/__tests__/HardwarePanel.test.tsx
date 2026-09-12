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
});
