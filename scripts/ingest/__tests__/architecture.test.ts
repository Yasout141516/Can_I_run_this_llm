// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readArchitecture } from "../architecture";
import { IngestError } from "../hfClient";

const LLAMA_31_8B = {
  num_hidden_layers: 32, num_key_value_heads: 8, head_dim: 128,
  max_position_embeddings: 131072, hidden_size: 4096, num_attention_heads: 32,
};

describe("readArchitecture", () => {
  it("reads the four fields the engine needs", () => {
    expect(readArchitecture(LLAMA_31_8B, "x/y")).toEqual({
      numLayers: 32, numKvHeads: 8, headDim: 128, maxContext: 131072,
    });
  });

  it("derives head_dim when the mirror omits it", () => {
    const { head_dim: _head_dim, ...without } = LLAMA_31_8B;
    // 4096 / 32 = 128 — the value the other mirror states outright.
    expect(readArchitecture(without, "x/y").headDim).toBe(128);
  });

  it("refuses to guess when neither head_dim nor its ingredients are present", () => {
    const { head_dim: _head_dim, hidden_size: _hidden_size, ...crippled } = LLAMA_31_8B;
    expect(() => readArchitecture(crippled, "x/y")).toThrow(IngestError);
  });

  it("names the repo and the field when something is missing", () => {
    const { num_key_value_heads: _num_key_value_heads, ...crippled } = LLAMA_31_8B;
    expect(() => readArchitecture(crippled, "meta-llama/Thing")).toThrow(
      /meta-llama\/Thing.*num_key_value_heads/s,
    );
  });

  it("rejects a non-integer layer count instead of rounding it", () => {
    expect(() => readArchitecture({ ...LLAMA_31_8B, num_hidden_layers: 31.5 }, "x/y")).toThrow(IngestError);
  });

  it("rejects head_dim when it is null instead of deriving", () => {
    expect(() => readArchitecture({ ...LLAMA_31_8B, head_dim: null }, "x/y")).toThrow(IngestError);
  });

  it("rejects head_dim when it is a string instead of deriving", () => {
    expect(() => readArchitecture({ ...LLAMA_31_8B, head_dim: "128" }, "x/y")).toThrow(IngestError);
  });
});
