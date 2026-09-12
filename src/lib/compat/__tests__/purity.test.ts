import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as compat from "../index";

// Resolved relative to this test file rather than vitest's cwd, so the scan
// works no matter where the runner is invoked from. Non-recursive: fine for
// the current flat layout, but a future subdirectory under src/lib/compat
// would go unscanned.
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const sourceFiles = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ name: f, text: readFileSync(join(DIR, f), "utf8") }));

describe("compat module surface", () => {
  it("exports the functions the UI needs", () => {
    expect(typeof compat.evaluate).toBe("function");
    expect(typeof compat.runCommand).toBe("function");
    expect(typeof compat.kvCacheBytes).toBe("function");
    expect(typeof compat.weightBytes).toBe("function");
    expect(compat.ENGINES).toBeDefined();
    expect(compat.GB).toBe(1_000_000_000);
  });
});

describe("compat module purity", () => {
  it("imports nothing from React, the DOM or the filesystem", () => {
    for (const { name, text } of sourceFiles) {
      expect(text, `${name} imports react`).not.toMatch(/from ["']react/);
      expect(text, `${name} uses fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(text, `${name} imports node:fs`).not.toMatch(/node:fs/);
      expect(text, `${name} reads the clock`).not.toMatch(/Date\.now|new Date\(\)/);
      expect(text, `${name} uses locale-dependent formatting`).not.toMatch(
        /toLocale[A-Za-z]*String|Intl\./,
      );
      expect(text, `${name} uses Math.random`).not.toMatch(/Math\.random/);
      expect(text, `${name} reads performance.now`).not.toMatch(/performance\.now/);
      expect(text, `${name} imports fs without the node: prefix`).not.toMatch(
        /from ["']fs["']|require\(["']fs["']\)/,
      );
      expect(text, `${name} touches a host global`).not.toMatch(
        /\bprocess\.|\bwindow\.|\blocalStorage\b/,
      );
    }
  });

  it("is deterministic — same inputs, same output", async () => {
    const { llama8b, rtx4070 } = await import("./fixtures");
    const s = { engine: "ollama", contextLength: 8192, kvPrecision: "fp16", quantId: "Q4_K_M" } as const;
    expect(compat.evaluate(llama8b, rtx4070, s)).toEqual(compat.evaluate(llama8b, rtx4070, s));
  });
});
