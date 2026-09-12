import type { HardwareSpec } from "./types";

/** Decimal GB, matching how VRAM and GGUF file sizes are quoted. */
export const GB = 1_000_000_000;

export const RAM_RESERVE_FRACTION = 0.15;
export const RAM_RESERVE_FLOOR = 2 * GB;

/** macOS default wired-memory limit; user-adjustable via iogpu.wired_limit_pct. */
export const APPLE_WIRED_FRACTION = 0.75;
/** Above the wired limit a unified-memory machine still runs, badly. */
export const APPLE_SOFT_CEILING = 0.9;

/**
 * Not all system RAM is available — the OS needs headroom. Treating 32 GB as
 * 32 GB is how you promise someone a model that thrashes their machine.
 */
export function usableRam(hw: HardwareSpec): number {
  if (hw.kind === "apple-silicon") return 0;
  const reserve = Math.max(hw.ramBytes * RAM_RESERVE_FRACTION, RAM_RESERVE_FLOOR);
  return Math.max(0, hw.ramBytes - reserve);
}

export function usableVram(hw: HardwareSpec): number {
  if (hw.kind === "apple-silicon") return hw.ramBytes * APPLE_WIRED_FRACTION;
  if (hw.kind === "cpu-only") return 0;
  return hw.vramBytes;
}
