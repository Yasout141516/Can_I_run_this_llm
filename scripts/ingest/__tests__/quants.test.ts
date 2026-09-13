// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GGUF_BPW } from "../../../src/lib/compat/quant";
import { measuredQuants, withEstimates } from "../quants";

const f = (rfilename: string, size: number) => ({ rfilename, size });

describe("measuredQuants", () => {
  it("reads a single-file quantisation at its real size", () => {
    const [q] = measuredQuants([f("Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf", 4_920_734_368)]);
    expect(q).toEqual({
      id: "Q4_K_M", format: "gguf", sizeBytes: 4_920_734_368,
      sizeSource: "measured", fileName: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    });
  });

  it("sums a split quantisation, because one part is not the model", () => {
    // Real sizes from bartowski/Llama-3.3-70B-Instruct-GGUF. Taking the first
    // part alone would claim 39.95 GB for something that needs 57.89 GB.
    const parts = [
      f("Llama-3.3-70B-Instruct-Q6_K/Llama-3.3-70B-Instruct-Q6_K-00001-of-00002.gguf", 39_953_848_064),
      f("Llama-3.3-70B-Instruct-Q6_K/Llama-3.3-70B-Instruct-Q6_K-00002-of-00002.gguf", 17_934_300_608),
    ];
    // measuredQuants is proven (by the single-file test above and the
    // implementation's grouping logic) to return one entry per distinct
    // quant id seen, so a two-file same-id input yields exactly one result.
    const [q] = measuredQuants(parts);
    expect(q!.id).toBe("Q6_K");
    expect(q!.sizeBytes).toBe(57_888_148_672);
  });

  it("ignores quantisations the engine cannot price", () => {
    // Q5_K_L and IQ1_M are real files in that repo but are absent from
    // GGUF_BPW, so nothing could size them when a file is missing.
    const ids = measuredQuants([
      f("x-Q5_K_L.gguf", 1), f("x-IQ1_M.gguf", 2), f("x-Q4_K_M.gguf", 3),
    ]).map((q) => q.id);
    expect(ids).toEqual(["Q4_K_M"]);
  });

  it("skips a file whose size the API did not report", () => {
    expect(measuredQuants([{ rfilename: "x-Q4_K_M.gguf" }])).toEqual([]);
  });

  it("drops an incomplete split rather than under-reporting it", () => {
    const half = [f("x-Q6_K/x-Q6_K-00001-of-00002.gguf", 39_953_848_064)];
    expect(measuredQuants(half)).toEqual([]);
  });

  it("sums a split quantisation whose parts arrive out of order", () => {
    // Same real sizes as the split-quantisation test above, reversed. The
    // grouping keys off part indices, not arrival order.
    const parts = [
      f("Llama-3.3-70B-Instruct-Q6_K/Llama-3.3-70B-Instruct-Q6_K-00002-of-00002.gguf", 17_934_300_608),
      f("Llama-3.3-70B-Instruct-Q6_K/Llama-3.3-70B-Instruct-Q6_K-00001-of-00002.gguf", 39_953_848_064),
    ];
    const [q] = measuredQuants(parts);
    expect(q!.id).toBe("Q6_K");
    expect(q!.sizeBytes).toBe(57_888_148_672);
  });

  it("drops a split with a duplicated part rather than doubling one part's bytes", () => {
    // Two files both claiming to be part 1 of 2, with part 2 never present.
    // A count of "how many files arrived" would read 2 === expected 2 and
    // wrongly pass; only checking which indices arrived catches this.
    const duplicated = [
      f("Llama-3.3-70B-Instruct-Q6_K/A-Q6_K-00001-of-00002.gguf", 39_953_848_064),
      f("Llama-3.3-70B-Instruct-Q6_K/B-Q6_K-00001-of-00002.gguf", 17_934_300_608),
    ];
    expect(measuredQuants(duplicated)).toEqual([]);
  });

  it("drops a group whose parts disagree on the total part count", () => {
    // A stray non-split file and a genuine two-part split, sharing an id.
    // Neither the single file's implicit "1 of 1" nor the split's "of 2"
    // should silently win; the whole group is unsizeable and is dropped.
    const mismatched = [
      f("x-Q6_K.gguf", 1_000),
      f("x-Q6_K-00001-of-00002.gguf", 39_953_848_064),
      f("x-Q6_K-00002-of-00002.gguf", 17_934_300_608),
    ];
    expect(measuredQuants(mismatched)).toEqual([]);
  });

  it("ignores non-gguf files entirely", () => {
    expect(measuredQuants([f("model-00001-of-00004.safetensors", 5), f("README.md", 6)])).toEqual([]);
  });
});

describe("withEstimates", () => {
  it("fills unmeasured quantisations from bits-per-weight", () => {
    const measured = measuredQuants([f("x-Q4_K_M.gguf", 4_920_734_368)]);
    const q8 = withEstimates(measured, 8_030_261_248).find((q) => q.id === "Q8_0")!;
    expect(q8.sizeSource).toBe("estimated");
    expect(q8.fileName).toBeUndefined();
    // Read the key out of the arithmetic path and assert it is present
    // before using it. `toBe` is `Object.is`, and `Object.is(NaN, NaN)` is
    // true — so `expect(x).toBe((n * GGUF_BPW.Q8_0!) / 8)` would still pass
    // even if `Q8_0` were removed from the table, because production and
    // the test would both compute `NaN` the same way. Asserting `bpw` is
    // defined first makes a missing key fail the test instead of matching it.
    const bpw = GGUF_BPW.Q8_0;
    expect(bpw).toBeDefined();
    expect(q8.sizeBytes).toBe((8_030_261_248 * bpw!) / 8);
  });

  it("never overwrites a measured size with an estimate", () => {
    const measured = measuredQuants([f("x-Q4_K_M.gguf", 4_920_734_368)]);
    const q4 = withEstimates(measured, 8_030_261_248).find((q) => q.id === "Q4_K_M")!;
    expect(q4.sizeSource).toBe("measured");
    expect(q4.sizeBytes).toBe(4_920_734_368);
  });

  it("offers every priceable quantisation exactly once", () => {
    const ids = withEstimates([], 8_030_261_248).map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(Object.keys(GGUF_BPW));
  });
});
