import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { evaluate, GB } from "../../../lib/compat";
import { loadModels } from "../../../lib/data/load";
import { scoreModels, type ScoredModel } from "../useVerdicts";
import { applyFilters, matchesModel, sortModels, sortRows } from "../sort";
import { ModelTable } from "../ModelTable";
import { APPLE_HW, REFERENCE_HW, REFERENCE_SETTINGS, TINY_HW } from "./fixtures";

const hw = REFERENCE_HW;
const settings = REFERENCE_SETTINGS;
const rows = scoreModels(loadModels(), hw, settings);

/**
 * A genuinely null-breakdown row, produced the same way evaluate() produces
 * one in the app: vLLM has no Metal backend, so the engine guard rejects
 * this model on Apple Silicon before any memory arithmetic runs at all.
 * Built via a real evaluate() call rather than a hand-written Verdict
 * literal, so this can't drift from what the engine actually returns.
 */
const unevaluableRow: ScoredModel = {
  model: loadModels()[0]!,
  verdict: evaluate(loadModels()[0]!, APPLE_HW, { ...settings, engine: "vllm" }),
};

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
    // A null breakdown has no size to sort by, so it is treated as Infinity —
    // matching sortRows itself, and keeping this array's numbers real for the
    // ascending-order check below.
    const totals = sorted.map((r) => r.verdict.breakdown?.totalBytes ?? Infinity);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
  });

  it("does not mutate its input", () => {
    const before = rows.map((r) => r.model.id);
    sortRows(rows, "size");
    expect(rows.map((r) => r.model.id)).toEqual(before);
  });

  it("sorts an unevaluable (null-breakdown) model last by size", () => {
    // Reverting the `?? Infinity` fallback to `?? 0` would put this row
    // FIRST — a model the engine could not even assess would look like the
    // smallest thing in the catalogue, which is a user-visible wrong answer.
    expect(unevaluableRow.verdict.breakdown).toBeNull();
    const sorted = sortRows([...rows, unevaluableRow], "size");
    expect(sorted[sorted.length - 1]).toBe(unevaluableRow);
  });

  it("sorts an unevaluable (null-breakdown) model last by compatibility too", () => {
    // wont-run is already the lowest-priority status bucket; within it, a
    // `?? 0` fallback would still reorder this row to the FRONT of that
    // bucket (0 sorts before a real multi-GB total) instead of to the back.
    expect(unevaluableRow.verdict.status).toBe("wont-run");
    const sorted = sortRows([...rows, unevaluableRow], "compatibility");
    expect(sorted[sorted.length - 1]).toBe(unevaluableRow);
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

  it("shows an em-dash rather than a fabricated size for a model the engine never evaluated", () => {
    // Reverting ModelTable's null check back to reading
    // `verdict.breakdown.totalBytes` directly would throw on this row (null
    // has no .totalBytes); reverting it to some zero-coalescing fallback
    // instead would silently print "0 MB · 0%", telling the user this model
    // needs nothing — worse than telling them nothing at all.
    render(
      <MemoryRouter>
        {/* filtered: true — a single-row, all-wont-run result set is otherwise
            read as "nothing fits this machine" and rendered as a summary
            message instead of the table (see ResultsEmptyState). */}
        <ModelTable rows={[unevaluableRow]} vramBytes={12 * GB} filtered />
      </MemoryRouter>,
    );
    const row = screen.getByRole("row", { name: new RegExp(unevaluableRow.model.displayName) });
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(within(row).queryByText(/0 (MB|GB)/)).not.toBeInTheDocument();
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
