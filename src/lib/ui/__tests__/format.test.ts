import { describe, expect, it } from "vitest";
import { formatGB, formatPercent, formatTokens } from "../format";

describe("formatGB", () => {
  it("renders two decimals with a unit", () => {
    expect(formatGB(4_920_734_208)).toBe("4.92 GB");
  });
  it("uses MB below a gigabyte so small numbers stay readable", () => {
    expect(formatGB(597_456_000)).toBe("597 MB");
  });
  it("renders zero without a negative sign", () => {
    expect(formatGB(0)).toBe("0 MB");
  });
});

describe("formatPercent", () => {
  it("rounds to a whole percent", () => {
    expect(formatPercent(6_591_932_032, 12_000_000_000)).toBe("55%");
  });
  it("reports over 100% rather than clamping — overflow is the useful signal", () => {
    expect(formatPercent(24_000_000_000, 12_000_000_000)).toBe("200%");
  });
  it("returns a dash when the denominator is zero", () => {
    expect(formatPercent(1, 0)).toBe("—");
  });
});

describe("formatTokens", () => {
  it("groups digits deterministically", () => {
    expect(formatTokens(131_072)).toBe("131,072");
  });
});
