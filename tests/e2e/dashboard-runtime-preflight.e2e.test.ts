import {
  createNextJsErrorMonitor,
  waitForPreviewDashboardHydration,
} from "./helpers";
import { test } from "./test";

test.describe("dashboard runtime preflight", () => {
  test("loads the explore dashboard without a Next.js build or runtime error", async ({
    page,
  }) => {
    const nextJsErrorMonitor = createNextJsErrorMonitor(page);

    try {
      await page.goto("/dashboard?explore=1");
      await waitForPreviewDashboardHydration(page);
      await nextJsErrorMonitor.assertNoNextJsErrors();
    } finally {
      nextJsErrorMonitor.dispose();
    }
  });
});
