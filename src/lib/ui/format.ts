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
