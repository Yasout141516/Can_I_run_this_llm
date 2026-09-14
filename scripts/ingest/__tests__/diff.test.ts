// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ModelSpec } from "../../../src/lib/compat/types";
import { isUnchanged, mergePreservingTimestamps } from "../diff";

const model = (over: Partial<ModelSpec> = {}): ModelSpec => ({
  id: "a/b", family: "F", displayName: "B",
  params: { total: 1, active: null },
  arch: { numLayers: 1, numKvHeads: 1, headDim: 1, maxContext: 1 },
  quants: [{ id: "Q4_K_M", format: "gguf", sizeBytes: 1, sizeSource: "estimated" }],
  benchmarks: {}, categories: ["chat"],
  source: { hfRepo: "a/b", fetchedAt: "2026-01-01T00:00:00.000Z" },
  ...over,
});

const restamped = (over: Partial<ModelSpec> = {}) =>
  model({ source: { hfRepo: "a/b", fetchedAt: "2026-09-14T00:00:00.000Z" }, ...over });

describe("mergePreservingTimestamps", () => {
  it("keeps the old timestamp when nothing else changed", () => {
    // Otherwise every scheduled run rewrites the file and the commit log
    // fills with timestamp churn.
    expect(mergePreservingTimestamps([restamped()], [model()])[0]?.source.fetchedAt)
      .toBe("2026-01-01T00:00:00.000Z");
  });

  it("takes the new timestamp when the data actually moved", () => {
    const next = [restamped({ params: { total: 2, active: null } })];
    expect(mergePreservingTimestamps(next, [model()])[0]?.source.fetchedAt)
      .toBe("2026-09-14T00:00:00.000Z");
  });

  it("stamps a model that did not exist before", () => {
    expect(mergePreservingTimestamps([model()], [])[0]?.source.fetchedAt)
      .toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("isUnchanged", () => {
  // JSON.stringify always emits bare "\n". A Windows checkout with
  // core.autocrlf=true (a common global git setting) rewrites those to
  // "\r\n", so a byte-for-byte comparison would treat a checked-out file
  // that never actually changed as different and rewrite it anyway.
  const lf = '{\n  "a": 1\n}\n';
  const crlf = lf.replace(/\n/g, "\r\n");

  it("treats CRLF-checked-out content as unchanged from the same content in LF", () => {
    expect(isUnchanged(crlf, lf)).toBe(true);
  });

  it("still detects a real content change through CRLF line endings", () => {
    const changed = '{\n  "a": 2\n}\n';
    expect(isUnchanged(crlf, changed)).toBe(false);
  });

  it("detects a real content change when both sides already use LF", () => {
    const changed = '{\n  "a": 2\n}\n';
    expect(isUnchanged(lf, changed)).toBe(false);
  });
});
