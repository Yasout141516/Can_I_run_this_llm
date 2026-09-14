import type { Breakdown } from "../compat";

const BYTES_PER_GB = 1_000_000_000;
const BYTES_PER_MB = 1_000_000;

/** Decimal units, matching how VRAM and GGUF file sizes are quoted. */
export function formatGB(bytes: number): string {
  if (bytes < BYTES_PER_GB) return `${Math.round(bytes / BYTES_PER_MB)} MB`;
  return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`;
}

/** Deliberately uncapped: "200%" tells the user how far over they are. */
export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export function formatTokens(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const BILLION = 1e9;

/**
 * Parameter count as people quote it. Mixture-of-experts models get both
 * numbers because they diverge in a way that matters: total drives memory
 * (every expert stays resident), active drives only speed.
 */
export function formatParams(params: { total: number; active: number | null }): string {
  const billions = (n: number, dp: number) => `${(n / BILLION).toFixed(dp)}B`;
  if (params.active === null) return `${billions(params.total, 1)} dense`;
  return `${billions(params.total, 0)} total / ${billions(params.active, 0)} active · MoE`;
}

/** Just the total, for dense columns where the MoE split does not fit. */
export function formatParamCount(total: number): string {
  return `${(total / BILLION).toFixed(1)}B`;
}

/**
 * A verdict the engine never computed has no total to show. Both of these
 * exist so that "no answer" renders as an em dash in exactly one place: the
 * previous arrangement repeated the null check at every call site, where a
 * new consumer could quietly reintroduce the all-zeroes-reads-as-"needs
 * nothing" bug that making the breakdown nullable was meant to end.
 */
export function formatBreakdownGB(breakdown: Breakdown | null): string {
  return breakdown === null ? "—" : formatGB(breakdown.totalBytes);
}

export function formatBreakdownPercent(
  breakdown: Breakdown | null,
  vramBytes: number,
): string {
  return breakdown === null ? "—" : formatPercent(breakdown.totalBytes, vramBytes);
}
