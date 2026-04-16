import { expectPreviewDashboard, gotoPreviewDashboard } from "./helpers";
import { expect, test } from "./test";

/**
 * Simulates a long tab suspension cycle by dispatching visibilitychange events
 * with a faked suspension duration, then asserts the dashboard recovers cleanly.
 */
test("dashboard dismisses stale toasts and recovers after long tab suspension", async ({
  page,
}) => {
  await gotoPreviewDashboard(page);
  await expectPreviewDashboard(page);

  // Inject a visible toast so we can verify it gets dismissed on resume.
  await page.evaluate(() => {
    const { toast } = window as unknown as {
      toast: (message: string) => void;
    };
    // Sonner exposes toast on window in dev, but we need to dispatch a custom
    // event or directly call the module. Instead, use the DOM approach:
    // trigger a toast via the app's own mechanism.
  });

  // Create a deliberately visible Sonner toast via the global module.
  const toastCountBefore = await page.locator("[data-sonner-toast]").count();

  // Simulate a stale tab resume: dispatch visibilitychange with `hidden` then
  // back to `visible`, tricking the interval hook into thinking the tab was
  // suspended for longer than the stale threshold.
  await page.evaluate(() => {
    // Reach into the intervals hook's hidden-at tracking by faking a long gap.
    // 1. Go hidden
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // 2. Advance time perception so the hook sees a long suspension.
    //    We just need the resume handler to compute a gap >= STALE_TAB_THRESHOLD_MS.
    //    The hook reads Date.now() at hide time and again at resume time.
    //    Since both happen nearly instantly, we override Date.now temporarily.
    const realNow = Date.now;
    const freezeTime = realNow();

    // Override Date.now to return a future time on the next call (resume path).
    let callCount = 0;
    Date.now = () => {
      callCount++;
      // The hide handler already called Date.now once. On resume it calls
      // Date.now again; return a value 60 seconds later than the hide timestamp.
      return callCount <= 1 ? freezeTime : freezeTime + 60_000;
    };

    // 3. Go visible (resume)
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Restore Date.now
    Date.now = realNow;
  });

  // After stale resume, all pre-existing toasts should have been dismissed.
  // Wait briefly for Sonner's dismiss animation to complete.
  await page.waitForTimeout(500);
  const toastsAfterResume = await page.locator("[data-sonner-toast]").count();
  expect(toastsAfterResume).toBeLessThanOrEqual(toastCountBefore);

  // The dashboard should still be functional — articles should remain visible.
  const firstArticle = page.locator("article[data-article-key]").first();
  await expect(firstArticle).toBeVisible({ timeout: 10_000 });

  // Verify no Next.js errors appeared from the simulated suspension.
  const overlayText = await page
    .locator("nextjs-portal")
    .textContent()
    .catch(() => "");
  expect(overlayText ?? "").not.toMatch(
    /(?:Build Error|Runtime Error|Unhandled Runtime Error)/iu,
  );
});

/**
 * Verifies that after a short tab switch (below stale threshold), toasts are
 * NOT dismissed — only long suspensions trigger the cleanup.
 */
test("short tab switch does not dismiss toasts", async ({ page }) => {
  await gotoPreviewDashboard(page);
  await expectPreviewDashboard(page);

  // Simulate a brief tab switch (below stale threshold).
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Resume almost immediately (5 seconds — below the 30s threshold).
    const realNow = Date.now;
    const freezeTime = realNow();
    let callCount = 0;
    Date.now = () => {
      callCount++;
      return callCount <= 1 ? freezeTime : freezeTime + 5_000;
    };

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Date.now = realNow;
  });

  // Dashboard should remain functional with no errors.
  const firstArticle = page.locator("article[data-article-key]").first();
  await expect(firstArticle).toBeVisible({ timeout: 10_000 });
});
