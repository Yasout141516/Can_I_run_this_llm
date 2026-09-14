import { GGUF_BPW } from "../../src/lib/compat/quant";
import type { QuantOption } from "../../src/lib/compat/types";
import type { HfSibling } from "./hfClient";

/** "…-Q6_K-00001-of-00002.gguf" → part 1 of 2. */
const SPLIT = /-(\d{5})-of-(\d{5})\.gguf$/;

/** The priceable ids, longest first, so "Q4_K_M" wins over any shorter id that
 *  is also a suffix of it. Built once: GGUF_BPW is a fixed module-level table,
 *  and quantIdOf runs per file in every repo listing. */
const QUANT_IDS_LONGEST_FIRST = Object.keys(GGUF_BPW).sort((a, b) => b.length - a.length);

/** Quantisation id from a bartowski-style filename: the trailing segment that
 *  the bits-per-weight table recognises. */
function quantIdOf(fileName: string): string | null {
  // `"a".split("/")` always yields at least one element, so pop() is never
  // undefined here — but noUncheckedIndexedAccess can't see that.
  const last = fileName.split("/").pop();
  if (last === undefined) return null;
  const base = last.replace(SPLIT, "").replace(/\.gguf$/, "").toUpperCase();
  return QUANT_IDS_LONGEST_FIRST.find((id) => base.endsWith(`-${id.toUpperCase()}`)) ?? null;
}

interface Group {
  bytes: number;
  /** Part index -> the file that carried it. Indices matter, not a count: two
   *  files both claiming "part 1 of 2" would satisfy a count of 2 while never
   *  covering part 2 at all. Keying by index catches that, and also answers
   *  which file is part 1 — the one llama.cpp must be pointed at to open a
   *  sharded GGUF — without tracking it separately. A non-split file is
   *  simply the single entry {1 -> itself}. */
  parts: Map<number, string>;
  expected: number;
  /** Set once a later file disagrees with the group's established `expected`
   *  part count, or repeats a part index already seen. Either is a malformed
   *  group, dropped exactly like a missing part — never merged, never
   *  guessed at. */
  invalid: boolean;
}


/** True when `indices` is exactly {1, 2, ..., expected} — no gap, no extra,
 *  no duplicate (duplicates are caught earlier and flip `invalid` instead,
 *  since a Set can't represent "the same index arrived twice"). */
function isCompleteRun(parts: Map<number, string>, expected: number): boolean {
  if (parts.size !== expected) return false;
  for (let i = 1; i <= expected; i++) {
    if (!parts.has(i)) return false;
  }
  return true;
}

/**
 * Real file sizes, with split quantisations summed. A split whose parts are
 * not all present — missing, duplicated, or disagreeing on the total part
 * count — is dropped entirely: an under- or over-reported size is worse than
 * an estimate, because it arrives wearing a "measured" badge and is believed.
 */
export function measuredQuants(siblings: HfSibling[]): QuantOption[] {
  const groups = new Map<string, Group>();

  for (const { rfilename, size } of siblings) {
    if (!rfilename.endsWith(".gguf") || typeof size !== "number") continue;
    const id = quantIdOf(rfilename);
    if (id === null) continue;

    const split = SPLIT.exec(rfilename);
    // Both capture groups in SPLIT are mandatory (neither is followed by
    // `?`), so a non-null `exec` result guarantees groups 1 and 2 each
    // matched a 5-digit string; noUncheckedIndexedAccess just can't see
    // that from the pattern, so the assertion is justified rather than
    // asserted past.
    const partIndex = split ? Number(split[1]!) : 1;
    const expected = split ? Number(split[2]!) : 1;

    const group = groups.get(id);
    if (group === undefined) {
      groups.set(id, {
        bytes: size,
        parts: new Map([[partIndex, rfilename]]),
        expected,
        invalid: false,
      });
      continue;
    }

    // A later part naming a different total, or repeating an index this
    // group already has, makes the whole group unsizeable — flag it and
    // stop trusting its byte count, rather than silently overwriting
    // `expected` or double-counting a duplicated part's bytes.
    if (group.expected !== expected || group.parts.has(partIndex)) {
      group.invalid = true;
      continue;
    }

    group.parts.set(partIndex, rfilename);
    group.bytes += size;
  }

  return [...groups.entries()]
    .filter(([, g]) => !g.invalid && isCompleteRun(g.parts, g.expected))
    .map(([id, g]) => ({
      id,
      format: "gguf" as const,
      sizeBytes: g.bytes,
      sizeSource: "measured" as const,
      // isCompleteRun guarantees part 1 is present, and a sharded GGUF is
      // opened via its first shard whatever order the listing arrived in.
      fileName: g.parts.get(1)!,
    }));
}

/** Every priceable quantisation: measured where a file exists, priced from
 *  bits-per-weight where it does not. Order follows GGUF_BPW, so the quant
 *  control reads high precision to low. That ordering has a second,
 *  load-bearing consumer: `pickQuant("auto")` in src/lib/compat/evaluate.ts
 *  picks the first loadable entry, so this array's order is what "auto"
 *  resolves to today. */
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
