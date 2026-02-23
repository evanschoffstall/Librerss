import { describe, expect, test } from "bun:test";
import { getRichContentClass } from "../app/dashboard/helpers/article-content";

describe("Article Image Rendering", () => {
  test("should include image styling in rich content classes", () => {
    const expandedClass = getRichContentClass(true);
    const collapsedClass = getRichContentClass(false);

    // Verify images are styled (not hidden)
    expect(expandedClass).toContain("[&_img]");
    expect(collapsedClass).toContain("[&_img]");

    // Verify figures are styled (not hidden)
    expect(expandedClass).toContain("[&_figure]");
    expect(collapsedClass).toContain("[&_figure]");

    // Verify figcaptions are styled (not hidden)
    expect(expandedClass).toContain("[&_figcaption]");
    expect(collapsedClass).toContain("[&_figcaption]");

    // Verify images are NOT hidden
    expect(expandedClass).not.toContain("[&_img]:hidden");
    expect(expandedClass).not.toContain("[&_figure]:hidden");
    expect(expandedClass).not.toContain("[&_figcaption]:hidden");
  });

  test("should include responsive image sizing", () => {
    const richContentClass = getRichContentClass(true);

    // Images should be responsive
    expect(richContentClass).toContain("max-w-full");
    expect(richContentClass).toContain("h-auto");
  });
});
