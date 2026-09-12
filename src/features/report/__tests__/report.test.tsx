import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HardwareProvider } from "../../../hooks/useHardwareForm";
import { ModelReport } from "../ModelReport";

function at(id: string) {
  return render(
    <HardwareProvider>
      <MemoryRouter initialEntries={[`/model/${encodeURIComponent(id)}`]}>
        <Routes>
          <Route path="/model/:id" element={<ModelReport />} />
        </Routes>
      </MemoryRouter>
    </HardwareProvider>,
  );
}

describe("ModelReport", () => {
  it("shows the memory breakdown, summing to the total", () => {
    at("meta-llama/Llama-3.1-8B-Instruct");
    const bar = screen.getByTestId("memory-bar");
    expect(within(bar).getByTestId("seg-weights")).toBeInTheDocument();
    // Scoped to the memory panel: the quant table's "Needs" column for the
    // active quant legitimately repeats the same total (6.59 GB), so an
    // unscoped getByText would find two matches for that one value.
    const panel = screen.getByTestId("memory-panel");
    expect(within(panel).getByText("4.92 GB")).toBeInTheDocument(); // weights
    expect(within(panel).getByText("1.07 GB")).toBeInTheDocument(); // kv
    expect(within(panel).getByText("6.59 GB")).toBeInTheDocument(); // total
  });

  it("lists a verdict for every quantisation the model ships", () => {
    at("meta-llama/Llama-3.1-8B-Instruct");
    const table = screen.getByTestId("quant-table");
    expect(within(table).getByText("Q4_K_M")).toBeInTheDocument();
    expect(within(table).getByText("AWQ-4bit")).toBeInTheDocument();
  });

  it("shows the run command for a model that fits", () => {
    at("meta-llama/Llama-3.1-8B-Instruct");
    expect(screen.getByTestId("run-it")).toHaveTextContent(
      "ollama run llama-3.1-8b-instruct:Q4_K_M",
    );
  });

  it("shows no run command for a model that will not run", () => {
    at("Qwen/Qwen3-235B-A22B");
    expect(screen.queryByTestId("run-it")).not.toBeInTheDocument();
    // This model ships a single quant that also fails, so "Won't run" is
    // legitimately rendered twice — once in the header pill, once in the
    // quant table's own row. Scope to the header landmark rather than
    // loosening this to an "at least one" assertion.
    expect(within(screen.getByRole("banner")).getByText(/Won't run/)).toBeInTheDocument();
  });

  it("reports an unknown model instead of crashing", () => {
    at("nobody/not-a-model");
    expect(screen.getByText(/not tracked/i)).toBeInTheDocument();
  });
});
