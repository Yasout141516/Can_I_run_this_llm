import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { GB, type HardwareSpec, type Settings } from "../lib/compat";
import type { GpuEntry, LaptopEntry } from "../lib/data/load";

const DEFAULT_HW: HardwareSpec = {
  kind: "discrete-gpu",
  vramBytes: 12 * GB,
  ramBytes: 32 * GB,
  ramType: "DDR5",
};

const DEFAULT_SETTINGS: Settings = {
  engine: "ollama",
  contextLength: 8192,
  kvPrecision: "fp16",
  quantId: "auto",
};

export function useHardwareForm() {
  const [hw, setHwState] = useState<HardwareSpec>(DEFAULT_HW);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [appliedLaptopId, setAppliedLaptopId] = useState<string | null>(null);

  // Patches, not replacements: a lookup prefills these same fields, so both
  // paths write to one place and the last write wins. That is what makes a
  // prefilled value overridable without any "unlock" step.
  const setHw = useCallback((patch: Partial<HardwareSpec>) => {
    setHwState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyGpu = useCallback((gpu: GpuEntry) => {
    setHwState((prev) => {
      const kind = gpu.vendor === "apple" ? "apple-silicon" : "discrete-gpu";
      return {
        ...prev,
        kind,
        vramBytes: gpu.vramBytes,
        memBandwidthGBs: gpu.memBandwidthGBs,
        // A discrete card carrying over "unified" from a previous MacBook
        // preset would be a stale, physically nonsensical value — ramType
        // only means something on the apple-silicon path that sets it.
        ramType: kind === "apple-silicon" ? prev.ramType : undefined,
      };
    });
  }, []);

  const applyLaptop = useCallback((laptop: LaptopEntry) => {
    setAppliedLaptopId(laptop.id);
    setHwState((prev) => ({
      ...prev,
      kind: laptop.kind,
      vramBytes: laptop.vramBytes,
      ramBytes: laptop.ramBytes,
      ramType: laptop.ramType,
    }));
  }, []);

  return { hw, settings, setHw, setSettings, applyGpu, applyLaptop, appliedLaptopId };
}

// The calculator page and the per-model report route must see the same
// hardware form, not two independent copies — otherwise a value typed on one
// screen silently fails to apply to the other. A hook alone can't share state
// across components, so this context holds the single instance both consume.
export const HardwareContext = createContext<ReturnType<typeof useHardwareForm> | null>(null);

export function HardwareProvider({ children }: { children: ReactNode }) {
  const value = useHardwareForm();
  return <HardwareContext.Provider value={value}>{children}</HardwareContext.Provider>;
}

export function useHardwareContext(): ReturnType<typeof useHardwareForm> {
  const ctx = useContext(HardwareContext);
  if (!ctx) throw new Error("useHardwareContext must be used inside a HardwareProvider");
  return ctx;
}
