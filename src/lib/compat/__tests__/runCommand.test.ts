import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { runCommand } from "../runCommand";
import { llama8b, llama70b, qwen235bMoe, rtx4070 } from "./fixtures";
import type { Settings } from "../types";

const ollama8k: Settings = {
  engine: "ollama",
  contextLength: 8192,
  kvPrecision: "fp16",
  quantId: "Q4_K_M",
};

describe("runCommand", () => {
  it("emits an ollama run line for a model that fits", () => {
    const v = evaluate(llama8b, rtx4070, ollama8k);
    expect(runCommand(llama8b, ollama8k, v)).toBe("ollama run llama-3.1-8b-instruct:Q4_K_M");
  });

  it("passes the verdict's layer count to llama.cpp", () => {
    const s: Settings = { ...ollama8k, engine: "llamacpp" };
    const v = evaluate(llama70b, rtx4070, s);
    const cmd = runCommand(llama70b, s, v);
    expect(cmd).toContain("--n-gpu-layers 16");
    expect(cmd).toContain("-c 8192");
    expect(cmd).toContain("Llama-3.3-70B-Instruct-Q4_K_M.gguf");
  });

  it("emits a vLLM line with the context length as --max-model-len", () => {
    const s: Settings = { ...ollama8k, engine: "vllm", quantId: "AWQ-4bit" };
    const v = evaluate(llama8b, rtx4070, s);
    expect(runCommand(llama8b, s, v)).toContain("--max-model-len 8192");
  });

  it("returns null for a model that will not run", () => {
    const v = evaluate(qwen235bMoe, rtx4070, ollama8k);
    expect(runCommand(qwen235bMoe, ollama8k, v)).toBeNull();
  });
});
