import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BENCHMARKS } from "../../features/benchmarks/benchmarkMeta";
import { loadModels } from "../../lib/data/load";
import { BenchmarksPage } from "../BenchmarksPage";

const page = () =>
  render(
    <MemoryRouter>
      <BenchmarksPage />
    </MemoryRouter>,
  );

const rowNames = () =>
  screen.queryAllByRole("rowheader").map((th) => th.textContent?.trim());

describe("BenchmarksPage", () => {
  it("gives every benchmark in the schema a column", () => {
    page();
    const header = within(screen.getByRole("table")).getAllByRole("columnheader");
    // Model name, then one column per benchmark.
    expect(header).toHaveLength(BENCHMARKS.length + 1);
  });

  it("gives every tracked model a row, including ones that report nothing", () => {
    page();
    expect(rowNames()).toHaveLength(loadModels().length);
  });

  it("prints an em dash for an unreported score, never a zero", () => {
    page();
    // Qwen3 235B reports none of these. A 0 would read as "scored zero",
    // which is a different and false claim from "did not report".
    const row = screen.getByRole("rowheader", { name: /Qwen3 235B/ }).closest("tr")!;
    expect(within(row).queryByText("0")).not.toBeInTheDocument();
    expect(within(row).getAllByText("—").length).toBe(BENCHMARKS.length);
  });

  it("opens ranked by MMLU, strongest first", () => {
    page();
    expect(rowNames()).toEqual([
      "Llama 3.3 70B Instruct",
      "Llama 3.1 8B Instruct",
      "Qwen3 235B A22B",
    ]);
  });

  it("ranks by whichever benchmark you choose, with unreported models last", async () => {
    page();
    await userEvent.selectOptions(screen.getByLabelText(/sort by/i), "humaneval");
    expect(rowNames()).toEqual([
      "Llama 3.3 70B Instruct",
      "Llama 3.1 8B Instruct",
      "Qwen3 235B A22B",
    ]);
  });

  it("filters the table as you type", async () => {
    page();
    await userEvent.type(screen.getByLabelText(/filter models/i), "8b");
    expect(rowNames()).toEqual(["Llama 3.1 8B Instruct"]);
  });

  it("says what each benchmark actually measures", () => {
    page();
    const glossary = screen.getByRole("region", { name: /what these measure/i });
    for (const { label } of BENCHMARKS) {
      expect(within(glossary).getByText(label)).toBeInTheDocument();
    }
  });

  it("states where the numbers come from, since cross-vendor scores are not like-for-like", () => {
    page();
    expect(screen.getByText(/model card/i)).toBeInTheDocument();
  });

  it("renders outside a HardwareProvider — a score is not a verdict", () => {
    expect(() => page()).not.toThrow();
  });
});
