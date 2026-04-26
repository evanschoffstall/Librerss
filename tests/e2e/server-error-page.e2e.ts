import { expect } from "@playwright/test";

import { test } from "./test";

/**
 * Playwright end-to-end tests for the `/error` server error page.
 *
 * The `/error` route is the navigable 500 error surface used by server-side
 * navigation endpoints (such as `/api/auth/dev-login`) to redirect users to
 * a proper HTML error page instead of returning a raw JSON 500 body. These
 * tests confirm the page renders correctly and exposes the expected UI.
 *
 * When a route redirects to `/error` it appends a `?cid=<uuid>` correlation
 * ID query parameter. The server logs both the `[ERROR]` entry (with the full
 * error) and the `[WARN]` render entry under the same `correlationId`, making
 * the two lines trivially matchable in the server console. The client UI is
 * identical regardless of whether the `cid` parameter is present.
 */
test.describe("/error server error page", () => {
  test("renders the 500 status page with eyebrow, message, and Try again link", async ({
    page,
  }) => {
    await page.goto("/error");

    // The data attribute written by StatusPage allows a precise selector.
    await expect(page.locator("[data-status-page='500']")).toBeVisible({
      timeout: 10_000,
    });

    // Eyebrow — rendered as <p>, not a heading
    await expect(page.getByText(/something went wrong/i).first()).toBeVisible();

    // The status code is the <h1>
    await expect(page.getByRole("heading", { name: "500" })).toBeVisible();

    // Body message
    await expect(page.getByText(/an unexpected error occurred/i)).toBeVisible();

    // "Try again" action must be present and link to the root so the user can
    // re-enter the normal app flow (auto-login or landing).
    const tryAgainLink = page.getByRole("link", { name: /try again/i });
    await expect(tryAgainLink).toBeVisible();
    await expect(tryAgainLink).toHaveAttribute("href", "/");
  });

  test("Try again navigates to the root entry point", async ({ page }) => {
    await page.goto("/error");

    await expect(page.locator("[data-status-page='500']")).toBeVisible({
      timeout: 10_000,
    });

    // Clicking "Try again" must navigate away from /error toward the root,
    // which the app will redirect to either /dashboard or /landing.
    await page.getByRole("link", { name: /try again/i }).click();
    await page.waitForURL(/\/(dashboard|landing|$)/u, { timeout: 15_000 });
  });

  test("renders identically when a correlation ID is present in the URL", async ({
    page,
  }) => {
    // Routes that redirect to /error append ?cid=<uuid> so the server can
    // correlate the [ERROR] log entry with the [WARN] render entry. The client
    // UI must be indistinguishable from a direct navigation — no raw ID or
    // debug data should leak into the rendered page.
    await page.goto("/error?cid=550e8400-e29b-41d4-a716-446655440000");

    await expect(page.locator("[data-status-page='500']")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/something went wrong/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "500" })).toBeVisible();
    await expect(page.getByText(/an unexpected error occurred/i)).toBeVisible();

    // The raw correlation ID must not appear anywhere in the visible page text.
    await expect(
      page.getByText("550e8400-e29b-41d4-a716-446655440000"),
    ).toHaveCount(0);
  });
});
