import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GLOBAL_STYLESHEET_PATH = join(process.cwd(), "src/app/globals.css");

/** Reads the source stylesheet that owns global ScrollArea scrollbar behavior. */
function readGlobalStylesheet() {
  return readFileSync(GLOBAL_STYLESHEET_PATH, "utf8");
}

describe("global ScrollArea scrollbar styles", () => {
  test("keeps Radix and dashboard scrollbars hidden until the owning ScrollArea is hovered", () => {
    const stylesheet = readGlobalStylesheet();

    expect(stylesheet).toContain(
      "[data-radix-scroll-area-viewport] ~ [data-orientation]",
    );
    expect(stylesheet).toContain(
      '[data-dashboard-feed-scrollbar="true"] + [aria-hidden="true"]',
    );
    expect(stylesheet).toContain(
      ':has(> [data-radix-scroll-area-viewport]):hover\n    > [data-orientation][data-state="visible"]',
    );
    expect(stylesheet).toContain(
      '[data-dashboard-feed-scrollbar="true"][data-dashboard-feed-scrollbar-overflow="true"]',
    );
    expect(stylesheet).toContain("opacity: 0;");
    expect(stylesheet).toContain("opacity: 1;");
  });

  test("keeps ScrollArea scrollbar rails completely removed on mobile-class inputs", () => {
    const stylesheet = readGlobalStylesheet();

    expect(stylesheet).toContain(
      "@media (hover: none), (pointer: coarse), (width < 768px)",
    );
    expect(stylesheet).toContain("display: none;");
    expect(stylesheet).toContain("pointer-events: none;");
  });
});
