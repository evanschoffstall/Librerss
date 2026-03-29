import { describe, expect, test } from "bun:test";

import type { CategoryTreeNode } from "@/lib";

import {
  DEFAULT_CATEGORY_LABEL,
  findCategoryByLabel,
  includesCategoryLabel,
  isSameCategoryLabel,
  normalizeCategory,
  normalizeCategoryLabelKey,
  removeCategoryLabel,
  replaceCategoryLabel,
  toCategoryLabelOrDefault,
} from "@/lib/utils/categories";
import {
  formatRelativeDate,
  parseDateOrFallback,
  parseDateOrNull,
} from "@/lib/utils/dates";
import {
  isSafePositiveItemId,
  isStrongPassword,
  isValidEmail,
} from "@/lib/utils/validation";

describe("small utils coverage", () => {
  test("covers date parsing and relative date formatting", () => {
    const fallback = new Date("2024-01-10T00:00:00.000Z");
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const threeDaysAgo = new Date(today.getTime() - 3 * 86_400_000);
    const older = new Date(today.getTime() - 10 * 86_400_000);

    expect(formatRelativeDate(today)).toMatch(/^Today /);
    expect(formatRelativeDate(yesterday)).toMatch(/^Yesterday /);
    expect(formatRelativeDate(threeDaysAgo)).toBe("3 days ago");
    expect(formatRelativeDate(older)).toBe(older.toLocaleDateString());
    expect(parseDateOrNull("2024-01-01T00:00:00.000Z")).toEqual(
      new Date("2024-01-01T00:00:00.000Z"),
    );
    expect(parseDateOrNull(new Date("2024-01-02T00:00:00.000Z"))).toEqual(
      new Date("2024-01-02T00:00:00.000Z"),
    );
    expect(parseDateOrNull(false)).toBeNull();
    expect(parseDateOrNull("not-a-date")).toBeNull();
    expect(parseDateOrFallback("bad-date", fallback)).toBe(fallback);
  });

  test("covers category normalization helpers", () => {
    const categories: CategoryTreeNode[] = [
      { children: [], key: "news", label: " News " },
      { children: [], key: "science", label: "Science" },
    ];

    expect(DEFAULT_CATEGORY_LABEL).toBe("My Feeds");
    expect(isSameCategoryLabel(" News ", "news")).toBe(true);
    expect(normalizeCategoryLabelKey(" Science ")).toBe("science");
    expect(toCategoryLabelOrDefault("  ")).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory(undefined)).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory("uncategorized")).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory(" Opinion ")).toBe("Opinion");
    expect(includesCategoryLabel(["News", "Science"], " news ")).toBe(true);
    expect(replaceCategoryLabel(["News", "Science"], "science", "Research")).toEqual([
      "News",
      "Research",
    ]);
    expect(removeCategoryLabel(["News", "Science"], " news ")).toEqual([
      "Science",
    ]);
    expect(findCategoryByLabel(categories, "news")).toBe(categories[0]);
  });

  test("covers validation helpers", () => {
    expect(isSafePositiveItemId(1)).toBe(true);
    expect(isSafePositiveItemId(0)).toBe(false);
    expect(isSafePositiveItemId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isSafePositiveItemId("1")).toBe(false);
    expect(isStrongPassword("Short1!")).toBe(false);
    expect(isStrongPassword("lowercasepassword1!")).toBe(true);
    expect(isStrongPassword("UPPERCASEPASSWORD1!")).toBe(true);
    expect(isStrongPassword("MixedCasePassword")).toBe(false);
    expect(isValidEmail("reader@example.com")).toBe(true);
    expect(isValidEmail("reader@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});