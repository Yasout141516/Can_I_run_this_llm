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
 * vLLM and SGLang's default `gpu_memory_utilization`. It lives here rather
 * than beside the engine profiles so the sizing math, the profiles and the
 * printed run command can all read one number — runCommand.ts cannot import
 * engines.ts without creating a cycle.
 */
export const DEFAULT_MEMORY_UTILIZATION = 0.9;

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

/**
 * The most memory a model may occupy and still run at all. A discrete GPU can
 * spill past VRAM into whatever system RAM the OS will spare. Apple Silicon
 * has no boundary to spill across, so its ceiling is a fraction of the single
 * unified pool — adding usableRam there would count the same physical bytes
 * twice. Keeping this here means only this module has to know what a hardware
 * `kind` means.
 */
export function spillCeiling(hw: HardwareSpec): number {
  if (hw.kind === "apple-silicon") return hw.ramBytes * APPLE_SOFT_CEILING;
  return usableVram(hw) + usableRam(hw);
}
