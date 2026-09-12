import { describe, expect, it } from "vitest";
import { GB, spillCeiling, usableRam, usableVram } from "../memory";
import type { HardwareSpec } from "../types";

const desktop = (vram: number, ram: number): HardwareSpec => ({
  kind: "discrete-gpu",
  vramBytes: vram * GB,
  ramBytes: ram * GB,
});

describe("usableRam", () => {
  it("reserves 15% on a large-RAM machine", () => {
    expect(usableRam(desktop(12, 64)) / GB).toBeCloseTo(54.4, 5);
  });

  it("reserves a 2 GB floor when 15% would be less", () => {
    expect(usableRam(desktop(8, 8)) / GB).toBeCloseTo(6, 5);
  });

  it("never goes negative on a tiny machine", () => {
    expect(usableRam(desktop(4, 2))).toBe(0);
  });

  it("is zero on Apple Silicon, where there is no separate pool to spill into", () => {
    const mac: HardwareSpec = { kind: "apple-silicon", vramBytes: 0, ramBytes: 32 * GB };
    expect(usableRam(mac)).toBe(0);
  });
});

describe("usableVram", () => {
  it("is the full VRAM on a discrete GPU", () => {
    expect(usableVram(desktop(12, 64))).toBe(12 * GB);
  });

  it("is 75% of the unified pool on Apple Silicon", () => {
    const mac: HardwareSpec = { kind: "apple-silicon", vramBytes: 0, ramBytes: 32 * GB };
    expect(usableVram(mac) / GB).toBeCloseTo(24, 5);
  });

  it("is zero on a CPU-only machine", () => {
    const cpu: HardwareSpec = { kind: "cpu-only", vramBytes: 0, ramBytes: 16 * GB };
    expect(usableVram(cpu)).toBe(0);
  });
});

describe("spillCeiling", () => {
  it("is VRAM plus usable RAM on a discrete GPU", () => {
    expect(spillCeiling(desktop(12, 64)) / GB).toBeCloseTo(66.4, 5);
  });

  it("is a fraction of the single pool on Apple Silicon, not pool + itself", () => {
    const mac: HardwareSpec = { kind: "apple-silicon", vramBytes: 0, ramBytes: 64 * GB };
    // 64 * 0.9 = 57.6, NOT 48 (wired) + 64 (ram) — that would count the same bytes twice.
    expect(spillCeiling(mac) / GB).toBeCloseTo(57.6, 5);
  });

  it("is usable RAM alone on a CPU-only machine", () => {
    const cpu: HardwareSpec = { kind: "cpu-only", vramBytes: 0, ramBytes: 16 * GB };
    expect(spillCeiling(cpu)).toBe(usableRam(cpu));
  });
});
