import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "../Badge";
import { Chip } from "../Chip";
import { Segmented } from "../Segmented";
import { VerdictPill } from "../Pill";

describe("VerdictPill", () => {
  it.each([
    ["run-on-gpu", "Run on GPU"],
    ["cpu-offloaded", "CPU offloaded"],
    ["wont-run", "Won't run"],
  ] as const)("labels %s in words, not colour alone", (status, text) => {
    render(<VerdictPill status={status} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("carries a non-colour glyph so it survives greyscale", () => {
    render(<VerdictPill status="run-on-gpu" />);
    expect(screen.getByTestId("verdict-glyph")).not.toBeEmptyDOMElement();
  });
});

describe("Badge", () => {
  it("says whether a size was measured or estimated", () => {
    render(<Badge source="estimated" />);
    expect(screen.getByText("Estimated")).toBeInTheDocument();
  });
});

describe("Segmented", () => {
  it("marks the selected option pressed and reports changes", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="KV cache precision"
        options={[
          { value: "fp16", label: "fp16" },
          { value: "q8", label: "q8" },
        ]}
        value="fp16"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "fp16" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "q8" }));
    expect(onChange).toHaveBeenCalledWith("q8");
  });
});

describe("Chip", () => {
  it("exposes its pressed state to assistive tech", () => {
    render(<Chip pressed onClick={() => {}}>Code</Chip>);
    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "true");
  });
});
