import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { GB, type HardwareSpec, type Settings } from "../../../lib/compat";
import { loadModels } from "../../../lib/data/load";
import { scoreModels } from "../useVerdicts";
import { applyFilters, sortRows } from "../sort";
import { ModelTable } from "../ModelTable";

const hw: HardwareSpec = { kind: "discrete-gpu", vramBytes: 12 * GB, ramBytes: 64 * GB };
const settings: Settings = { engine: "ollama", contextLength: 8192, kvPrecision: "fp16", quantId: "auto" };
const rows = scoreModels(loadModels(), hw, settings);

describe("applyFilters", () => {
  it("matches on display name, case-insensitively", () => {
    expect(applyFilters(rows, { query: "llama", categories: [] })).toHaveLength(2);
  });

  it("matches on family so a search for a series finds its members", () => {
    expect(applyFilters(rows, { query: "qwen3", categories: [] })).toHaveLength(1);
  });

  it("filters by category", () => {
    const reasoning = applyFilters(rows, { query: "", categories: ["reasoning"] });
    expect(reasoning.every((r) => r.model.categories.includes("reasoning"))).toBe(true);
    expect(reasoning.length).toBeGreaterThan(0);
  });

  it("returns everything when nothing is selected", () => {
    expect(applyFilters(rows, { query: "", categories: [] })).toHaveLength(rows.length);
  });
});

describe("sortRows", () => {
  it("puts runnable models first by compatibility", () => {
    expect(sortRows(rows, "compatibility")[0]?.verdict.status).toBe("run-on-gpu");
  });

  it("sorts by memory need ascending", () => {
    const sorted = sortRows(rows, "size");
    const totals = sorted.map((r) => r.verdict.breakdown.totalBytes);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
  });

  it("does not mutate its input", () => {
    const before = rows.map((r) => r.model.id);
    sortRows(rows, "size");
    expect(rows.map((r) => r.model.id)).toEqual(before);
  });
});

describe("ModelTable", () => {
  it("renders one row per model with a scrollable container", () => {
    render(
      <MemoryRouter>
        <ModelTable rows={rows} vramBytes={12 * GB} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(rows.length + 1); // + header
    expect(screen.getByTestId("table-scroll")).toHaveStyle({ overflowX: "auto" });
  });
});
