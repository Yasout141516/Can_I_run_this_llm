import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { GB, type HardwareSpec, type Settings } from "../../../lib/compat";
import { loadModels } from "../../../lib/data/load";
import { isTightFit, scoreModels } from "../useVerdicts";
import { ModelList } from "../ModelList";
import { StatTiles } from "../StatTiles";

const hw: HardwareSpec = { kind: "discrete-gpu", vramBytes: 12 * GB, ramBytes: 64 * GB };
const settings: Settings = {
  engine: "ollama",
  contextLength: 8192,
  kvPrecision: "fp16",
  quantId: "auto",
};
const rows = () => scoreModels(loadModels(), hw, settings);

describe("scoreModels", () => {
  it("scores every model exactly once", () => {
    expect(rows()).toHaveLength(loadModels().length);
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
});

describe("ModelList", () => {
  it("shows the memory need and what share of the card it takes", () => {
    render(
      <MemoryRouter>
        <ModelList rows={rows()} vramBytes={12 * GB} />
      </MemoryRouter>,
    );
    const card = screen.getByTestId("card-meta-llama/Llama-3.1-8B-Instruct");
    expect(within(card).getByText("6.59 GB")).toBeInTheDocument();
    expect(within(card).getByText("55%")).toBeInTheDocument();
  });

  it("labels each verdict in words as well as colour", () => {
    render(
      <MemoryRouter>
        <ModelList rows={rows()} vramBytes={12 * GB} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Run on GPU")).toBeInTheDocument();
    expect(screen.getByText("Won't run")).toBeInTheDocument();
  });

  it("names the creator and the context window, the two fields a scanner uses", () => {
    render(
      <MemoryRouter>
        <ModelList rows={rows()} vramBytes={12 * GB} />
      </MemoryRouter>,
    );
    const card = screen.getByTestId("card-meta-llama/Llama-3.1-8B-Instruct");
    expect(within(card).getByText("meta-llama")).toBeInTheDocument();
    expect(within(card).getByText(/131,072 ctx/)).toBeInTheDocument();
  });

  it("tells the user when a machine can run nothing, instead of showing a blank list", () => {
    const tiny: HardwareSpec = { kind: "discrete-gpu", vramBytes: 2 * GB, ramBytes: 4 * GB };
    render(
      <MemoryRouter>
        <ModelList rows={scoreModels(loadModels(), tiny, settings)} vramBytes={2 * GB} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/nothing here fits/i)).toBeInTheDocument();
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
