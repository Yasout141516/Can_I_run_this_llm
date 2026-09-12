import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HardwareProvider } from "../../hooks/useHardwareForm";
import { CalculatorPage } from "../CalculatorPage";

const page = () =>
  render(
    <MemoryRouter>
      <HardwareProvider>
        <CalculatorPage />
      </HardwareProvider>
    </MemoryRouter>,
  );

describe("CalculatorPage", () => {
  it("renders results at rest, with no submit step", () => {
    page();
    expect(screen.getByTestId("tile-run-on-gpu")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /calculate|submit/i })).not.toBeInTheDocument();
  });

  it("re-scores live when VRAM changes", async () => {
    page();
    // 12 GB: the 8B fits. Drop to 4 GB and it must stop fitting.
    expect(screen.getByText("Run on GPU")).toBeInTheDocument();
    const vram = screen.getByLabelText(/vram/i);
    await userEvent.clear(vram);
    await userEvent.type(vram, "4");
    expect(screen.queryByText("Run on GPU")).not.toBeInTheDocument();
  });

  it("filters the list as you type", async () => {
    page();
    await userEvent.type(screen.getByLabelText(/filter models/i), "qwen");
    expect(screen.queryByText("Llama 3.1 8B Instruct")).not.toBeInTheDocument();
    expect(screen.getByText("Qwen3 235B A22B")).toBeInTheDocument();
  });

  it("switches to the table view", async () => {
    page();
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
