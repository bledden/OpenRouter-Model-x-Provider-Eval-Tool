import {
  BASELINE_SCORES,
  VERIFIED_CATEGORIES,
  LIMITED_DATA_CATEGORIES,
  isCategoryVerified,
  hasLimitedData,
} from "@/lib/eval-storage";

describe("eval-storage", () => {
  describe("BASELINE_SCORES", () => {
    it("should contain scores for major models", () => {
      expect(BASELINE_SCORES["openai/gpt-4o"]).toBeDefined();
      expect(BASELINE_SCORES["anthropic/claude-3.5-sonnet"]).toBeDefined();
      expect(BASELINE_SCORES["google/gemini-2.5-pro"]).toBeDefined();
    });

    it("should have coding scores for coding-capable models", () => {
      const gpt4o = BASELINE_SCORES["openai/gpt-4o"];
      expect(gpt4o.coding).toBeDefined();
      expect(gpt4o.coding).toBeGreaterThan(0);
      expect(gpt4o.coding).toBeLessThanOrEqual(100);
    });

    it("should have valid score ranges", () => {
      for (const [modelId, scores] of Object.entries(BASELINE_SCORES)) {
        for (const [category, score] of Object.entries(scores)) {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe("VERIFIED_CATEGORIES", () => {
    it("should include core benchmark categories", () => {
      expect(VERIFIED_CATEGORIES).toContain("coding");
      expect(VERIFIED_CATEGORIES).toContain("reasoning");
      expect(VERIFIED_CATEGORIES).toContain("math");
      expect(VERIFIED_CATEGORIES).toContain("knowledge");
    });
  });

  describe("LIMITED_DATA_CATEGORIES", () => {
    it("should include categories without standardized benchmarks", () => {
      expect(LIMITED_DATA_CATEGORIES).toContain("conversation");
      expect(LIMITED_DATA_CATEGORIES).toContain("creative");
      expect(LIMITED_DATA_CATEGORIES).toContain("roleplay");
    });
  });

  describe("isCategoryVerified", () => {
    it("should return true for verified categories", () => {
      expect(isCategoryVerified("coding")).toBe(true);
      expect(isCategoryVerified("reasoning")).toBe(true);
      expect(isCategoryVerified("math")).toBe(true);
    });

    it("should return false for unverified categories", () => {
      expect(isCategoryVerified("conversation")).toBe(false);
      expect(isCategoryVerified("creative")).toBe(false);
      expect(isCategoryVerified("unknown")).toBe(false);
    });
  });

  describe("hasLimitedData", () => {
    it("should return true for limited data categories", () => {
      expect(hasLimitedData("conversation")).toBe(true);
      expect(hasLimitedData("creative")).toBe(true);
      expect(hasLimitedData("roleplay")).toBe(true);
    });

    it("should return false for well-benchmarked categories", () => {
      expect(hasLimitedData("coding")).toBe(false);
      expect(hasLimitedData("reasoning")).toBe(false);
      expect(hasLimitedData("unknown")).toBe(false);
    });
  });
});
