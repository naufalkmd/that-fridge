import { describe, it, expect } from "vitest";
import { guessIcon, guessLocation, suggestShelfLifeDays } from "./data";

describe("guessIcon", () => {
  it("matches known curated keywords", () => {
    expect(guessIcon("Milk")).toBe("milk");
    expect(guessIcon("Plain Yogurt")).toBe("yogurt");
    expect(guessIcon("Block of Cheese")).toBe("cheese");
    expect(guessIcon("A dozen eggs")).toBe("eggs");
    expect(guessIcon("Leftover Pasta")).toBe("leftovers");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(guessIcon("  MILK  ")).toBe("milk");
  });

  it("returns null for text with no matching keyword", () => {
    expect(guessIcon("Widget")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(guessIcon("")).toBeNull();
    expect(guessIcon("   ")).toBeNull();
  });
});

describe("guessLocation", () => {
  it("recognizes freezer keywords", () => {
    expect(guessLocation("Frozen Peas")).toBe("freezer");
    expect(guessLocation("Vanilla Ice Cream")).toBe("freezer");
  });

  it("recognizes pantry keywords", () => {
    expect(guessLocation("Canned Beans")).toBe("pantry");
    expect(guessLocation("White Rice")).toBe("pantry");
  });

  it("defaults to fridge for anything else", () => {
    expect(guessLocation("Milk")).toBe("fridge");
    expect(guessLocation("Something Unrecognized")).toBe("fridge");
  });
});

describe("suggestShelfLifeDays", () => {
  it("returns the specific shelf life for a known icon", () => {
    expect(suggestShelfLifeDays("milk")).toBe(7);
    expect(suggestShelfLifeDays("meat")).toBe(3);
  });

  it("falls back to 7 days for an unknown icon", () => {
    expect(suggestShelfLifeDays("nonexistent-icon")).toBe(7);
  });
});
