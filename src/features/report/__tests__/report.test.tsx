import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "../../../App";
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
    // quant table's own row. Scope to the masthead by its own test id rather
    // than the "banner" role: testing-library maps <header> to that role by
    // tag name alone, without the HTML-AAM rule that excludes a <header>
    // nested inside <main> — a real screen reader exposes no banner landmark
    // here, so that scoping only ever passed by accident of the harness.
    expect(within(screen.getByTestId("report-masthead")).getByText(/Won't run/)).toBeInTheDocument();
  });

  it("reports an unknown model instead of crashing", () => {
    at("nobody/not-a-model");
    expect(screen.getByText(/not tracked/i)).toBeInTheDocument();
  });
});

describe("ModelReport reads the hardware shared with the calculator", () => {
  it("reflects a VRAM change made on the calculator, rather than a fresh default", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const vram = screen.getByLabelText(/^vram/i);
    await userEvent.clear(vram);
    await userEvent.type(vram, "4");

    await userEvent.click(screen.getByRole("link", { name: "Llama 3.1 8B Instruct" }));

    // At the default 12 GB this model runs entirely on the GPU; at 4 GB it
    // must spill to system RAM. If ModelReport called useHardwareForm()
    // itself instead of reading the shared HardwareProvider context, it
    // would still show the fresh-default 12 GB verdict here — this is the
    // regression guard for the whole shared-state design.
    expect(
      within(screen.getByTestId("report-masthead")).getByText("CPU offloaded"),
    ).toBeInTheDocument();
  });
});
