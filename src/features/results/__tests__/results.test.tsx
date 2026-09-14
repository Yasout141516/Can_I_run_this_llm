import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { GB, type HardwareSpec } from "../../../lib/compat";
import { loadModels } from "../../../lib/data/load";
import { isTightFit, scoreModels } from "../useVerdicts";
import { ModelList } from "../ModelList";
import { StatTiles } from "../StatTiles";
import { REFERENCE_HW, REFERENCE_SETTINGS, TINY_HW, unevaluableRow } from "./fixtures";

const hw = REFERENCE_HW;
const settings = REFERENCE_SETTINGS;
const rows = () => scoreModels(loadModels(), hw, settings);

describe("scoreModels", () => {
  it("scores every model in the input, in order, without dropping or reordering any", () => {
    // rows() is `models.map(...)`, so `toHaveLength(models.length)` alone
    // would pass even if scoring were a no-op — it's true by construction of
    // .map. Check the actual per-index correspondence instead, plus that
    // scoring really happened (different models land different verdicts).
    const models = loadModels();
    const scored = rows();
    expect(scored.map((r) => r.model)).toEqual(models);
    expect(new Set(scored.map((r) => r.verdict.status)).size).toBeGreaterThan(1);
  });

  it("reproduces the engine's verdicts on the reference machine", () => {
    const byId = new Map(rows().map((r) => [r.model.id, r.verdict.status]));
    expect(byId.get("meta-llama/Llama-3.1-8B-Instruct")).toBe("run-on-gpu");
    expect(byId.get("meta-llama/Llama-3.3-70B-Instruct")).toBe("cpu-offloaded");
    expect(byId.get("Qwen/Qwen3-235B-A22B")).toBe("wont-run");
  });
});

describe("StatTiles", () => {
  it("counts each bucket", () => {
    render(<StatTiles rows={rows()} />);
    expect(within(screen.getByTestId("tile-run-on-gpu")).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByTestId("tile-cpu-offloaded")).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByTestId("tile-wont-run")).getByText("1")).toBeInTheDocument();
  });

  it("maps each status to its own tile, not just to some tile with the right count", () => {
    // One model per bucket (the test above) can't tell a correct
    // status→tile mapping from a swapped one — any permutation of three
    // distinct 1s still reads "1, 1, 1". Score against a roomier machine
    // where the buckets land 2/1/0, so a swap changes what a specific tile
    // reads and the assertion actually distinguishes the mapping.
    const roomy: HardwareSpec = { kind: "discrete-gpu", vramBytes: 48 * GB, ramBytes: 256 * GB };
    render(<StatTiles rows={scoreModels(loadModels(), roomy, settings)} />);
    expect(within(screen.getByTestId("tile-run-on-gpu")).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByTestId("tile-cpu-offloaded")).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByTestId("tile-wont-run")).getByText("0")).toBeInTheDocument();
  });
});

describe("ModelList", () => {
  it("shows the memory need and what share of the card it takes", () => {
    render(
      <MemoryRouter>
        <ModelList rows={rows()} vramBytes={12 * GB} filtered={false} />
      </MemoryRouter>,
    );
    const card = screen.getByTestId("card-meta-llama/Llama-3.1-8B-Instruct");
    expect(within(card).getByText("6.59 GB")).toBeInTheDocument();
    expect(within(card).getByText("55%")).toBeInTheDocument();
  });

  it("labels each verdict in words as well as colour", () => {
    render(
      <MemoryRouter>
        <ModelList rows={rows()} vramBytes={12 * GB} filtered={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Run on GPU")).toBeInTheDocument();
    expect(screen.getByText("Won't run")).toBeInTheDocument();
  });

  it("names the creator and the context window, the two fields a scanner uses", () => {
    render(
      <MemoryRouter>
        <ModelList rows={rows()} vramBytes={12 * GB} filtered={false} />
      </MemoryRouter>,
    );
    const card = screen.getByTestId("card-meta-llama/Llama-3.1-8B-Instruct");
    expect(within(card).getByText("meta-llama")).toBeInTheDocument();
    // Labelled as a maximum, not the context the totals beside it were
    // computed at — the model's max context and the user's configured
    // context are two different numbers that must never look like one.
    expect(within(card).getByText(/up to 131,072 tokens/)).toBeInTheDocument();
  });

  it("tells the user when a machine can run nothing, instead of showing a blank list", () => {
    const tiny = TINY_HW;
    render(
      <MemoryRouter>
        <ModelList
          rows={scoreModels(loadModels(), tiny, settings)}
          vramBytes={2 * GB}
          filtered={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/nothing here fits/i)).toBeInTheDocument();
  });

  it("shows an em-dash rather than a fabricated size for a model the engine never evaluated", () => {
    // Reverting ModelCard's null check back to reading
    // `verdict.breakdown.totalBytes` directly would throw on this row;
    // coalescing it to zero instead would silently print "0 GB · 0%",
    // telling the user this unevaluated model needs nothing.
    expect(unevaluableRow.verdict.breakdown).toBeNull();
    render(
      <MemoryRouter>
        {/* filtered: true — a single-row, all-wont-run result set is otherwise
            read as "nothing fits this machine" and rendered as a summary
            message instead of the cards (see ResultsEmptyState). */}
        <ModelList rows={[unevaluableRow]} vramBytes={12 * GB} filtered />
      </MemoryRouter>,
    );
    const card = screen.getByTestId(`card-${unevaluableRow.model.id}`);
    expect(within(card).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(within(card).queryByText(/0 (MB|GB)/)).not.toBeInTheDocument();
  });

  it("does not blame the whole machine when a filter is what narrowed the list to unrunnable models", () => {
    // Same tiny machine, same all-wont-run result set, but this time it is
    // framed as a search/category match rather than the full catalogue — the
    // machine-level message would overstate what the hardware can do, so the
    // cards should render instead, each with its own accurate verdict.
    const tiny = TINY_HW;
    render(
      <MemoryRouter>
        <ModelList
          rows={scoreModels(loadModels(), tiny, settings)}
          vramBytes={2 * GB}
          filtered
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/nothing here fits/i)).not.toBeInTheDocument();
    expect(screen.getByText("Llama 3.1 8B Instruct")).toBeInTheDocument();
  });
});

describe("isTightFit", () => {
  it("flags a model that fits but leaves almost no headroom", () => {
    // 6.59 GB of a 7 GB card is 94% — it "runs", until anything else touches the GPU.
    const [eightB] = scoreModels(
      loadModels().filter((m) => m.id === "meta-llama/Llama-3.1-8B-Instruct"),
      { kind: "discrete-gpu", vramBytes: 7 * GB, ramBytes: 64 * GB },
      settings,
    );
    expect(eightB!.verdict.status).toBe("run-on-gpu");
    expect(isTightFit(eightB!.verdict, 7 * GB)).toBe(true);
  });

  it("does not flag a comfortable fit", () => {
    const [eightB] = rows().filter((r) => r.model.id === "meta-llama/Llama-3.1-8B-Instruct");
    expect(isTightFit(eightB!.verdict, 12 * GB)).toBe(false);
  });

  it("never flags a model that does not run on the GPU at all", () => {
    const [big] = rows().filter((r) => r.model.id === "Qwen/Qwen3-235B-A22B");
    expect(isTightFit(big!.verdict, 12 * GB)).toBe(false);
  });
});
