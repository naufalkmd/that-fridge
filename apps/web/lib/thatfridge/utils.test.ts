import { describe, it, expect } from "vitest";
import { freshColor, daysLabel, timeAgo, FRESH_GREEN, FRESH_AMBER, FRESH_RED } from "./utils";

describe("freshColor", () => {
  it("is green at and above 60", () => {
    expect(freshColor(60)).toBe(FRESH_GREEN);
    expect(freshColor(100)).toBe(FRESH_GREEN);
  });

  it("is amber between 30 and 59", () => {
    expect(freshColor(30)).toBe(FRESH_AMBER);
    expect(freshColor(59)).toBe(FRESH_AMBER);
  });

  it("is red below 30", () => {
    expect(freshColor(29)).toBe(FRESH_RED);
    expect(freshColor(0)).toBe(FRESH_RED);
    expect(freshColor(-5)).toBe(FRESH_RED);
  });
});

describe("daysLabel", () => {
  it("labels a negative day count as expired", () => {
    expect(daysLabel(-1)).toBe("Expired");
  });

  it("labels 0 and 1 days as Today", () => {
    expect(daysLabel(0)).toBe("Today");
    expect(daysLabel(1)).toBe("Today");
  });

  it("labels more than 1 day as a countdown", () => {
    expect(daysLabel(2)).toBe("2d left");
    expect(daysLabel(14)).toBe("14d left");
  });
});

describe("timeAgo", () => {
  it("labels the current moment as just now", () => {
    expect(timeAgo(Date.now())).toBe("Just now");
  });

  it("labels minutes, hours, and days correctly", () => {
    expect(timeAgo(Date.now() - 5 * 60_000)).toBe("5m ago");
    expect(timeAgo(Date.now() - 3 * 3_600_000)).toBe("3h ago");
    expect(timeAgo(Date.now() - 2 * 86_400_000)).toBe("2d ago");
  });
});
