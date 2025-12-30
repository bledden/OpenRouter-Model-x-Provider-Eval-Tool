import { formatScore, formatPrice, getScoreColor, getStatusClass } from "@/lib/api";

describe("api utilities", () => {
  describe("formatScore", () => {
    it("should format score as percentage", () => {
      expect(formatScore(0.85)).toBe("85.0%");
      expect(formatScore(1.0)).toBe("100.0%");
      expect(formatScore(0)).toBe("0.0%");
    });

    it("should handle decimal precision", () => {
      expect(formatScore(0.856)).toBe("85.6%");
      expect(formatScore(0.8567)).toBe("85.7%");
    });
  });

  describe("formatPrice", () => {
    it("should format price with dollar sign", () => {
      expect(formatPrice(10)).toBe("$10.00");
      expect(formatPrice(0.5)).toBe("$0.50");
      expect(formatPrice(100.99)).toBe("$100.99");
    });

    it("should handle zero", () => {
      expect(formatPrice(0)).toBe("$0.00");
    });
  });

  describe("getScoreColor", () => {
    it("should return green for high scores", () => {
      expect(getScoreColor(0.9)).toBe("text-[var(--signal-green)]");
      expect(getScoreColor(0.85)).toBe("text-[var(--signal-green)]");
    });

    it("should return blue for medium-high scores", () => {
      expect(getScoreColor(0.7)).toBe("text-[var(--signal-blue)]");
      expect(getScoreColor(0.84)).toBe("text-[var(--signal-blue)]");
    });

    it("should return amber for medium scores", () => {
      expect(getScoreColor(0.5)).toBe("text-[var(--signal-amber)]");
      expect(getScoreColor(0.69)).toBe("text-[var(--signal-amber)]");
    });

    it("should return red for low scores", () => {
      expect(getScoreColor(0.49)).toBe("text-[var(--signal-red)]");
      expect(getScoreColor(0)).toBe("text-[var(--signal-red)]");
    });
  });

  describe("getStatusClass", () => {
    it("should return healthy for status 0", () => {
      expect(getStatusClass(0)).toBe("healthy");
    });

    it("should return error for non-zero status", () => {
      expect(getStatusClass(1)).toBe("error");
      expect(getStatusClass(-1)).toBe("error");
    });
  });
});
