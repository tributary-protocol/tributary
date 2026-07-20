import { describe, it, expect } from "vitest";
import { tokenCode, shortAddress } from "../lib/tributary";
import { TOKENS } from "../lib/tributary";

describe("tributary library", () => {
  describe("tokenCode", () => {
    it("returns token code for known contract", () => {
      expect(tokenCode(TOKENS[0].contract)).toBe("XLM");
      expect(tokenCode(TOKENS[1].contract)).toBe("USDC");
    });

    it("returns short address for unknown contract", () => {
      const unknownContract =
        "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYXX";
      const result = tokenCode(unknownContract);
      expect(result).toBe(shortAddress(unknownContract));
    });

    it("returns empty string for undefined contract", () => {
      expect(tokenCode(undefined)).toBe("");
    });
  });

  describe("shortAddress", () => {
    it("truncates addresses to first 4 + last 4 chars with ellipsis", () => {
      const address = "GBRPYHIL2CI3C2ULFROEVUDKNCN76VYQQ5FAKNSTKORZMTFSLOMNBTOL";
      const result = shortAddress(address);
      expect(result).toBe("GBRP…BTOL");
      expect(result).toHaveLength(9); // 4 + 1 (ellipsis) + 4
    });

    it("handles short addresses correctly", () => {
      const shortAddr = "ABC";
      expect(shortAddress(shortAddr)).toContain("…");
    });
  });
});
