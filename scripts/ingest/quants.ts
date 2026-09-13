import { GGUF_BPW } from "../../src/lib/compat/quant";
import type { QuantOption } from "../../src/lib/compat/types";

/** "…-Q6_K-00001-of-00002.gguf" → part 1 of 2. */
const SPLIT = /-(\d{5})-of-(\d{5})\.gguf$/;

/** Quantisation id from a bartowski-style filename: the trailing segment that
 *  the bits-per-weight table recognises. Longest match first, so "Q4_K_M"
 *  wins over any shorter id that is also a suffix. */
function quantIdOf(fileName: string): string | null {
  const segments = fileName.split("/");
  // `"a".split("/")` always yields at least one element, so this is never
  // undefined — but noUncheckedIndexedAccess can't see that, so check it.
  const last = segments[segments.length - 1];
  if (last === undefined) return null;
  const base = last.replace(SPLIT, "").replace(/\.gguf$/, "");
  return (
    Object.keys(GGUF_BPW)
      .slice()
      .sort((a, b) => b.length - a.length)
      .find((id) => base.toUpperCase().endsWith(`-${id.toUpperCase()}`)) ?? null
  );
}

/**
 * Real file sizes, with split quantisations summed. A split whose parts are
 * not all present is dropped: an under-reported size is worse than an
 * estimate, because it arrives wearing a "measured" badge.
 */
export function measuredQuants(siblings: { rfilename: string; size?: number }[]): QuantOption[] {
  const groups = new Map<string, { bytes: number; parts: number; expected: number; fileName: string }>();

  for (const { rfilename, size } of siblings) {
    if (!rfilename.endsWith(".gguf") || typeof size !== "number") continue;
    const id = quantIdOf(rfilename);
    if (id === null) continue;

    const split = SPLIT.exec(rfilename);
    // Both capture groups in SPLIT are mandatory (neither is followed by
    // `?`), so a non-null `exec` result guarantees group 2 matched some
    // 5-digit string; noUncheckedIndexedAccess just can't see that from the
    // pattern, so the assertion is justified rather than asserted past.
    const expected = split ? Number(split[2]!) : 1;
    const prev = groups.get(id) ?? { bytes: 0, parts: 0, expected, fileName: rfilename };
    groups.set(id, {
      bytes: prev.bytes + size,
      parts: prev.parts + 1,
      expected,
      fileName: prev.fileName,
    });
  }

  return [...groups.entries()]
    .filter(([, g]) => g.parts === g.expected)
    .map(([id, g]) => ({
      id,
      format: "gguf" as const,
      sizeBytes: g.bytes,
      sizeSource: "measured" as const,
      fileName: g.fileName,
    }));
}

/** Every priceable quantisation: measured where a file exists, priced from
 *  bits-per-weight where it does not. Order follows GGUF_BPW, so the quant
 *  control reads high precision to low. */
export function withEstimates(measured: QuantOption[], totalParams: number): QuantOption[] {
  const byId = new Map(measured.map((q) => [q.id, q]));
  return Object.entries(GGUF_BPW).map(
    ([id, bpw]) =>
      byId.get(id) ?? {
        id,
        format: "gguf" as const,
        sizeBytes: (totalParams * bpw) / 8,
        sizeSource: "estimated" as const,
      },
  );
}
