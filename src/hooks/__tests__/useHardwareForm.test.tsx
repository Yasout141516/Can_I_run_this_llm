import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GB } from "../../lib/compat";
import { HardwareProvider, useHardwareContext, useHardwareForm } from "../useHardwareForm";

const rtx4090 = { id: "rtx-4090", name: "RTX 4090", vendor: "nvidia" as const, vramBytes: 24 * GB };
const macbook = {
  id: "macbook-pro-16-m3-max-64",
  name: 'MacBook Pro 16" M3 Max (64GB)',
  kind: "apple-silicon" as const,
  gpuId: "apple-m3-max",
  vramBytes: 0,
  ramBytes: 64 * GB,
  ramType: "unified" as const,
};

describe("useHardwareForm", () => {
  it("starts from a sensible default", () => {
    const { result } = renderHook(() => useHardwareForm());
    expect(result.current.hw.kind).toBe("discrete-gpu");
    expect(result.current.settings.engine).toBe("ollama");
  });

  it("prefills VRAM from a GPU lookup", () => {
    const { result } = renderHook(() => useHardwareForm());
    act(() => result.current.applyGpu(rtx4090));
    expect(result.current.hw.vramBytes).toBe(24 * GB);
  });

  it("prefills every field from a laptop lookup", () => {
    const { result } = renderHook(() => useHardwareForm());
    act(() => result.current.applyLaptop(macbook));
    expect(result.current.hw.kind).toBe("apple-silicon");
    expect(result.current.hw.ramBytes).toBe(64 * GB);
    expect(result.current.hw.ramType).toBe("unified");
  });

  it("KEEPS a manual override after a laptop prefill — form state is the truth", () => {
    const { result } = renderHook(() => useHardwareForm());
    act(() => result.current.applyLaptop(macbook));
    act(() => result.current.setHw({ ramBytes: 96 * GB }));
    expect(result.current.hw.ramBytes).toBe(96 * GB);
    // and nothing re-applies the preset behind the user's back
    expect(result.current.hw.kind).toBe("apple-silicon");
  });

  it("clamps context to the model maximum only when asked, never silently", () => {
    const { result } = renderHook(() => useHardwareForm());
    act(() => result.current.setSettings({ contextLength: 200_000 }));
    expect(result.current.settings.contextLength).toBe(200_000);
  });
});

describe("HardwareProvider", () => {
  it("shares one state between two consumers", () => {
    function A() {
      const { hw, setHw } = useHardwareContext();
      return <button onClick={() => setHw({ vramBytes: 24 * GB })}>{hw.vramBytes}</button>;
    }
    function B() {
      const { hw } = useHardwareContext();
      return <output data-testid="b">{hw.vramBytes}</output>;
    }
    render(
      <HardwareProvider>
        <A />
        <B />
      </HardwareProvider>,
    );
    act(() => {
      screen.getByRole("button").click();
    });
    expect(screen.getByTestId("b")).toHaveTextContent(String(24 * GB));
  });

  it("fails loudly when used outside a provider", () => {
    function Orphan() {
      useHardwareContext();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/HardwareProvider/);
  });
});
