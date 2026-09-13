import { GB, type HardwareSpec, type Settings } from "../../../lib/compat";

/** The reference machine the plan's golden anchors were computed against. */
export const REFERENCE_HW: HardwareSpec = {
  kind: "discrete-gpu",
  vramBytes: 12 * GB,
  ramBytes: 64 * GB,
};

export const REFERENCE_SETTINGS: Settings = {
  engine: "ollama",
  contextLength: 8192,
  kvPrecision: "fp16",
  quantId: "auto",
};

/** Small enough that nothing in the catalogue fits, for empty-state cases. */
export const TINY_HW: HardwareSpec = {
  kind: "discrete-gpu",
  vramBytes: 2 * GB,
  ramBytes: 4 * GB,
};
