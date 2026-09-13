import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HardwareProvider, useHardwareContext } from "../../hooks/useHardwareForm";
import { GB } from "../../lib/compat";
import { loadModels } from "../../lib/data/load";
import { WelcomePage } from "../WelcomePage";

const welcome = () =>
  render(
    <MemoryRouter>
      <HardwareProvider>
        <WelcomePage />
      </HardwareProvider>
    </MemoryRouter>,
  );

const bestFits = () => screen.getByRole("region", { name: /best fits/i });
const legend = () => screen.getByRole("region", { name: /what the verdicts mean/i });

/** A stand-in for the calculator's VRAM field, sharing the same provider. */
function ChangeVram() {
  const { setHw } = useHardwareContext();
  return (
    <button type="button" onClick={() => setHw({ vramBytes: 2 * GB })}>
      drop to 2 GB
    </button>
  );
}

describe("WelcomePage", () => {
  it("names the product and its promise", () => {
    welcome();
    expect(screen.getByRole("heading", { level: 1, name: "Runcheck" })).toBeInTheDocument();
    expect(screen.getByText(/will it run\?/i)).toBeInTheDocument();
  });

  it("explains all three verdicts before you have entered anything", () => {
    welcome();
    // Scoped to the legend: the best-fits cards below render pills of their
    // own, so an unscoped query would pass on those alone.
    for (const verdict of ["Run on GPU", "CPU offloaded", "Won't run"]) {
      expect(within(legend()).getByText(verdict)).toBeInTheDocument();
    }
  });

  it("shows the legend with the same pills the results use, glyphs and all", () => {
    welcome();
    // Three real VerdictPills, not a drawing of them: if the legend ever drifts
    // from the component the results render, this catches it.
    expect(within(legend()).getAllByTestId("verdict-glyph")).toHaveLength(3);
  });

  it("states the differentiator: the arithmetic is shown, not hidden", () => {
    welcome();
    expect(screen.getByText(/the arithmetic behind every answer/i)).toBeInTheDocument();
    expect(screen.getByText(/black box/i)).toBeInTheDocument();
  });

  it("leads into the calculator", () => {
    welcome();
    expect(screen.getByRole("link", { name: /check my hardware/i })).toHaveAttribute(
      "href",
      "/calculator",
    );
  });
});

describe("WelcomePage best fits", () => {
  it("shows the models that fit, capped so the front door stays a front door", () => {
    welcome();
    const cards = within(bestFits()).getAllByRole("article");
    expect(cards).toHaveLength(Math.min(6, loadModels().length));
  });

  it("leads with what runs on the GPU, not with what cannot run", () => {
    welcome();
    const [first] = within(bestFits()).getAllByRole("article");
    expect(first).toBeDefined();
    expect(within(first!).getByText("Run on GPU")).toBeInTheDocument();
  });

  it("says which hardware it scored against, so defaults are not read as facts", () => {
    welcome();
    // The default machine is 12 GB VRAM / 32 GB RAM. A visitor who has set
    // nothing must be told that, not left to assume it is theirs.
    expect(within(bestFits()).getByText(/12\.00 GB VRAM/)).toBeInTheDocument();
    expect(within(bestFits()).getByRole("link", { name: /change/i })).toHaveAttribute(
      "href",
      "/calculator",
    );
  });

  it("re-scores against hardware set on the calculator", async () => {
    render(
      <MemoryRouter>
        <HardwareProvider>
          <>
            <WelcomePage />
            <ChangeVram />
          </>
        </HardwareProvider>
      </MemoryRouter>,
    );
    expect(within(bestFits()).queryAllByText("Run on GPU").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "drop to 2 GB" }));
    expect(within(bestFits()).queryByText("Run on GPU")).not.toBeInTheDocument();
  });

  it("hands off to the full catalogue", () => {
    welcome();
    expect(screen.getByRole("link", { name: /browse all/i })).toHaveAttribute("href", "/browse");
  });
});
