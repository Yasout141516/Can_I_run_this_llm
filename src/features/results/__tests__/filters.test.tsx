import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { GB } from "../../../lib/compat";
import { loadModels } from "../../../lib/data/load";
import { scoreModels } from "../useVerdicts";
import { applyFilters, matchesModel, sortModels, sortRows } from "../sort";
import { ModelTable } from "../ModelTable";
import { REFERENCE_HW, REFERENCE_SETTINGS, TINY_HW } from "./fixtures";

const hw = REFERENCE_HW;
const settings = REFERENCE_SETTINGS;
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
        <ModelTable rows={rows} vramBytes={12 * GB} filtered={false} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(rows.length + 1); // + header
    expect(screen.getByTestId("table-scroll")).toHaveStyle({ overflowX: "auto" });
  });

  it("names why a won't-run row won't run", () => {
    render(
      <MemoryRouter>
        <ModelTable rows={rows} vramBytes={12 * GB} filtered={false} />
      </MemoryRouter>,
    );
    const wontRun = rows.find((r) => r.verdict.status === "wont-run");
    expect(wontRun!.verdict.notes[0]).toBeTruthy();
    expect(screen.getByText(wontRun!.verdict.notes[0]!)).toBeInTheDocument();
  });

  // The table used to drop straight to a bare header row with none of the
  // explanation ModelList gives for the same two dead ends — switching view
  // must not silently lose the message.
  it("shows the same 'no matches' message as the card view when filters exclude everything", () => {
    render(
      <MemoryRouter>
        <ModelTable rows={[]} vramBytes={12 * GB} filtered />
      </MemoryRouter>,
    );
    expect(screen.getByText("No models match these filters.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the same 'nothing fits this machine' message, unfiltered, when every model won't run", () => {
    const tiny = TINY_HW;
    render(
      <MemoryRouter>
        <ModelTable
          rows={scoreModels(loadModels(), tiny, settings)}
          vramBytes={2 * GB}
          filtered={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/nothing here fits this machine/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("matchesModel", () => {
  const models = loadModels();

  it("is the predicate applyFilters is built from, so the two lists cannot drift", () => {
    // Browse has no verdicts and so cannot use applyFilters, which takes
    // ScoredModel[]. Both must agree on what "matches" means.
    const direct = models.filter((m) => matchesModel(m, { query: "llama", categories: [] }));
    const scored = applyFilters(rows, { query: "llama", categories: [] });
    expect(direct.map((m) => m.id)).toEqual(scored.map((r) => r.model.id));
  });

  it("requires the query and the category to both hold", () => {
    const llama = models.find((m) => m.displayName.includes("Llama 3.1 8B"))!;
    expect(matchesModel(llama, { query: "llama", categories: ["chat"] })).toBe(
      llama.categories.includes("chat"),
    );
    expect(matchesModel(llama, { query: "qwen", categories: ["chat"] })).toBe(false);
  });
});

describe("sortModels", () => {
  const models = loadModels();

  it("sorts by name without needing a verdict", () => {
    const names = sortModels(models, "name").map((m) => m.displayName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("sorts by parameter count, largest first", () => {
    const params = sortModels(models, "params").map((m) => m.params.total);
    expect(params).toEqual([...params].sort((a, b) => b - a));
  });

  it("sorts by max context, longest first", () => {
    const ctx = sortModels(models, "context").map((m) => m.arch.maxContext);
    expect(ctx).toEqual([...ctx].sort((a, b) => b - a));
  });

  it("sorts by the smallest quant on offer, which is a data fact and not a verdict", () => {
    const sizes = sortModels(models, "size").map((m) =>
      Math.min(...m.quants.map((q) => q.sizeBytes)),
    );
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it("leaves the caller's array alone", () => {
    const before = models.map((m) => m.id);
    sortModels(models, "name");
    expect(models.map((m) => m.id)).toEqual(before);
  });
});
