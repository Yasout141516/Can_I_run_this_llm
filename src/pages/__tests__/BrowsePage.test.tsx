import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { loadModels } from "../../lib/data/load";
import { BrowsePage } from "../BrowsePage";

const browse = () =>
  render(
    <MemoryRouter>
      <BrowsePage />
    </MemoryRouter>,
  );

const rowNames = () =>
  screen.queryAllByRole("rowheader").map((th) => th.textContent?.trim());

describe("BrowsePage", () => {
  it("lists every tracked model", () => {
    browse();
    expect(rowNames()).toHaveLength(loadModels().length);
  });

  it("renders outside a HardwareProvider, because the catalogue is not scored", () => {
    // The whole point of the page: facts about models, no hardware involved.
    expect(() => browse()).not.toThrow();
  });

  it("shows no verdicts — those belong to the calculator and the report", () => {
    browse();
    for (const verdict of ["Run on GPU", "CPU offloaded", "Won't run"]) {
      expect(screen.queryByText(verdict)).not.toBeInTheDocument();
    }
  });

  it("states each model's size floor with its provenance, not a bare number", () => {
    browse();
    const row = screen.getByRole("rowheader", { name: /Llama 3.1 8B Instruct/ }).closest("tr")!;
    // The smallest quant on offer, and whether that size was measured from a
    // real file or priced from bits-per-weight.
    expect(within(row).getByText(/GB|MB/)).toBeInTheDocument();
    expect(within(row).getByText(/measured|estimated/i)).toBeInTheDocument();
  });

  it("links each model to its report", () => {
    browse();
    expect(screen.getByRole("link", { name: "Llama 3.1 8B Instruct" })).toHaveAttribute(
      "href",
      "/model/meta-llama%2FLlama-3.1-8B-Instruct",
    );
  });

  it("filters as you type", async () => {
    browse();
    await userEvent.type(screen.getByLabelText(/filter models/i), "qwen");
    expect(rowNames()).toEqual(["Qwen3 235B A22B"]);
  });

  it("filters by category", async () => {
    browse();
    await userEvent.click(screen.getByRole("button", { name: "reasoning" }));
    const expected = loadModels()
      .filter((m) => m.categories.includes("reasoning"))
      .map((m) => m.displayName);
    expect(expected.length).toBeGreaterThan(0);
    expect(rowNames().sort()).toEqual(expected.sort());
  });

  it("sorts by parameter count, largest first", async () => {
    browse();
    await userEvent.selectOptions(screen.getByLabelText(/sort by/i), "params");
    const byParams = [...loadModels()].sort((a, b) => b.params.total - a.params.total);
    expect(rowNames()).toEqual(byParams.map((m) => m.displayName));
  });

  it("says so when a filter matches nothing, instead of showing an empty table", async () => {
    browse();
    await userEvent.type(screen.getByLabelText(/filter models/i), "zzzz");
    expect(screen.queryAllByRole("rowheader")).toHaveLength(0);
    expect(screen.getByText(/no models match/i)).toBeInTheDocument();
  });
});
