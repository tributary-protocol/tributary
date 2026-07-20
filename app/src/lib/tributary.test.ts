import { describe, expect, it } from "vitest";
import {
  ConversionError,
  formatAmount,
  fromStroops,
  recipientLabel,
  shortAddress,
  splitPath,
  toStroops,
  tokenCode,
  TOKENS,
} from "./tributary";

describe("tokenCode", () => {
  it("returns the code for a known token contract", () => {
    expect(tokenCode(TOKENS[0].contract)).toBe("XLM");
    expect(tokenCode(TOKENS[1].contract)).toBe("USDC");
  });

  it("shortens unknown contracts and handles a missing contract", () => {
    expect(tokenCode("CUNKNOWN1234567890")).toBe("CUNK…7890");
    expect(tokenCode(undefined)).toBe("");
  });
});

describe("recipientLabel", () => {
  it("shortens account recipients", () => {
    expect(
      recipientLabel({
        tag: "Account",
        values: ["GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"],
      }),
    ).toBe("GABC…7890");
  });

  it("labels split recipients, including split zero", () => {
    expect(recipientLabel({ tag: "Split", values: [0n] })).toBe("split #0");
  });
});

describe("shortAddress", () => {
  it("keeps the first and last four characters of a long address", () => {
    expect(shortAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890")).toBe(
      "GABC…7890",
    );
  });

  it("handles empty and shorter-than-eight-character addresses", () => {
    expect(shortAddress("")).toBe("…");
    expect(shortAddress("GABC")).toBe("GABC…GABC");
  });
});

describe("splitPath", () => {
  it("builds a route for a bigint split id", () => {
    expect(splitPath(42n)).toBe("/split/42");
  });

  it("preserves string ids, including an empty id", () => {
    expect(splitPath("0007")).toBe("/split/0007");
    expect(splitPath("")).toBe("/split/");
  });
});

describe("formatAmount", () => {
  it("adds grouping and preserves a decimal fraction", () => {
    expect(formatAmount("1234567.5")).toBe("1,234,567.5");
  });

  it("returns non-numeric and empty input unchanged", () => {
    expect(formatAmount("not-an-amount")).toBe("not-an-amount");
    expect(formatAmount("")).toBe("");
  });
});

describe("fromStroops", () => {
  it("formats small values with up to 7 decimal places", () => {
    expect(fromStroops(50000000n)).toBe("5");
    expect(fromStroops(55000000n)).toBe("5.5");
    expect(fromStroops(1n)).toBe("0.0000001");
    expect(fromStroops(0n)).toBe("0");
  });

  it("applies thousands grouping to the whole part", () => {
    expect(fromStroops(12_345_670_000_000n)).toBe("1,234,567");
  });

  it("is exact at and around Number.MAX_SAFE_INTEGER", () => {
    // Number.MAX_SAFE_INTEGER = 9_007_199_254_740_991
    const atLimit = BigInt(Number.MAX_SAFE_INTEGER);
    expect(fromStroops(atLimit)).toBe("900,719,925.4740991");
  });

  it("distinguishes values above 2^53 that collapse when cast through Number()", () => {
    // These two bigints are adjacent, but Number(...) rounds them to the
    // same double, which is exactly the bug this fix removes.
    const a = 90071992547409910n;
    const b = 90071992547409911n;

    expect(Number(a)).toBe(Number(b)); // sanity check: the old bug's root cause
    expect(fromStroops(a)).toBe("9,007,199,254.740991");
    expect(fromStroops(b)).toBe("9,007,199,254.7409911");
    expect(fromStroops(a)).not.toBe(fromStroops(b));
  });

  it("handles very large i128-scale amounts exactly", () => {
    const huge = 170141183460469231731687303715884105727n; // i128::MAX in stroops
    const result = fromStroops(huge);
    expect(result.startsWith("17,014,118,346,046,923,173,168,730,371,588")).toBe(true);
  });

  it("handles negative amounts", () => {
    expect(fromStroops(-55000000n)).toBe("-5.5");
  });

  it("round-trips through toStroops for representative values", () => {
    const cases: [string, string][] = [
      ["0", "0"],
      ["5", "5"],
      ["5.5", "5.5"],
      ["0.0000001", "0.0000001"],
      ["1234567.1234567", "1,234,567.1234567"],
      ["9007199254.740991", "9,007,199,254.740991"],
    ];
    for (const [input, expected] of cases) {
      expect(fromStroops(toStroops(input))).toBe(expected);
    }
  });
});

describe("toStroops", () => {
  it("converts a whole number", () => {
    expect(toStroops("1")).toBe(10_000_000n);
  });

  it("converts zero", () => {
    expect(toStroops("0")).toBe(0n);
  });

  it("converts a decimal", () => {
    expect(toStroops("1.5")).toBe(15_000_000n);
  });

  it("pads short decimals", () => {
    expect(toStroops("0.0000001")).toBe(1n);
  });

  it("truncates excess decimals (7 decimal places max)", () => {
    expect(toStroops("1.12345678")).toBe(11_234_567n);
  });

  it("handles leading decimal point", () => {
    expect(toStroops(".5")).toBe(5_000_000n);
  });

  it("handles trailing decimal point", () => {
    expect(toStroops("5.")).toBe(50_000_000n);
  });

  it("rejects empty string", () => {
    expect(() => toStroops("")).toThrow(ConversionError);
  });

  it("rejects scientific notation (e.g. 1e5)", () => {
    expect(() => toStroops("1e5")).toThrow(ConversionError);
    expect(() => toStroops("1e-5")).toThrow(ConversionError);
  });

  it("rejects negative numbers", () => {
    expect(() => toStroops("-5")).toThrow(ConversionError);
    expect(() => toStroops("-0.5")).toThrow(ConversionError);
  });

  it("rejects multiple decimal points", () => {
    expect(() => toStroops("1.2.3")).toThrow(ConversionError);
  });

  it("rejects non-numeric strings", () => {
    expect(() => toStroops("abc")).toThrow(ConversionError);
  });

  it("rejects bare decimal point", () => {
    expect(() => toStroops(".")).toThrow(ConversionError);
  });
});
