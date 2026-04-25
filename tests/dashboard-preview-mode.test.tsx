import { describe, expect, test } from "bun:test";

describe("dashboard preview mode", () => {
  test("resolveDashboardPreviewMode enables preview only from the explore query", async () => {
    const {
      isDashboardPreviewModeEnabled,
      resolveDashboardPreviewMode,
      setDashboardPreviewPersistence,
    } = await import("@/app/dashboard/preview-mode");

    expect(isDashboardPreviewModeEnabled("1")).toBe(true);
    expect(isDashboardPreviewModeEnabled("0")).toBe(false);
    expect(
      resolveDashboardPreviewMode({
        hasExploreQuery: true,
      }),
    ).toBe(true);
    expect(
      resolveDashboardPreviewMode({
        hasExploreQuery: false,
      }),
    ).toBe(false);

    expect(() => setDashboardPreviewPersistence(true)).not.toThrow();
    expect(() => setDashboardPreviewPersistence(false)).not.toThrow();
  });

  test("setDashboardPreviewPersistence is a no-op when document is unavailable", async () => {
    const { setDashboardPreviewPersistence } =
      await import("@/app/dashboard/preview-mode");
    const originalDocument = globalThis.document;

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: undefined,
    });

    expect(() => setDashboardPreviewPersistence(true)).not.toThrow();

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  });
});
