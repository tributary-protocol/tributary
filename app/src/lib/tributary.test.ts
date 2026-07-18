import { describe, it, expect } from "vitest";
import { toStroops, ConversionError, localPreviewPayout } from "./tributary";

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

describe("localPreviewPayout", () => {
  it("splits equally among recipients", () => {
    const shares = [5000, 5000];
    const amount = 1000n;
    expect(localPreviewPayout(shares, amount)).toEqual([500n, 500n]);
  });

  it("assigns remainder dust to the last recipient", () => {
    const shares = [3333, 3333, 3334];
    const amount = 100n;
    // 33.33 -> 33, 33.33 -> 33, last gets remainder: 100 - 66 = 34
    expect(localPreviewPayout(shares, amount)).toEqual([33n, 33n, 34n]);
  });

  it("handles zero amount or empty shares gracefully", () => {
    expect(localPreviewPayout([], 100n)).toEqual([]);
    expect(localPreviewPayout([5000, 5000], 0n)).toEqual([]);
  });
});
