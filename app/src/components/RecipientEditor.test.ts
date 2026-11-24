import { describe, it, expect } from "vitest";
import { parseCsv, rowsTotal, rowsError } from "./RecipientEditor";

const G = "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

const G2 = "GEFGHIJKLMNOPQRSTUVWXYZ234567EFGHIJKLMNOPQRSTUVWXYZ23456";

describe("parseCsv", () => {
  it("parses address rows", () => {
    const rows = parseCsv(`${G},50\n${G2},50`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ kind: "address", value: G, percent: "50" });
    expect(rows[1]).toEqual({ kind: "address", value: G2, percent: "50" });
  });

  it("parses split id rows", () => {
    const rows = parseCsv("42,33.33\n7,66.67");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ kind: "split", value: "42", percent: "33.33" });
    expect(rows[1]).toEqual({ kind: "split", value: "7", percent: "66.67" });
  });

  it("detects kind by value format", () => {
    const rows = parseCsv(`${G},50\n42,50`);
    expect(rows[0].kind).toBe("address");
    expect(rows[1].kind).toBe("split");
  });

  it("skips empty lines and comments", () => {
    const rows = parseCsv(`${G},100\n\n# this is a comment\n\n`);
    expect(rows).toHaveLength(1);
  });

  it("skips a header row", () => {
    const rows = parseCsv(`address,percent\n${G},100`);
    expect(rows).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(parseCsv("")).toHaveLength(0);
    expect(parseCsv("  ")).toHaveLength(0);
  });

  it("parses rows with mixed kinds", () => {
    const rows = parseCsv(`${G},60\n3,40`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ kind: "address", value: G, percent: "60" });
    expect(rows[1]).toEqual({ kind: "split", value: "3", percent: "40" });
  });

  it("trims whitespace from values", () => {
    const rows = parseCsv(`  ${G} , 50  `);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(G);
    expect(rows[0].percent).toBe("50");
  });
});

describe("rowsTotal", () => {
  it("sums percentages", () => {
    const rows = parseCsv(`${G},60\n3,40`);
    expect(rowsTotal(rows)).toBe(100);
  });

  it("handles empty rows", () => {
    expect(rowsTotal([])).toBe(0);
  });
});

describe("rowsError", () => {
  it("returns null for valid rows", () => {
    const rows = parseCsv(`${G},50\n${G2},50`);
    expect(rowsError(rows, (k) => k)).toBeNull();
  });
});
