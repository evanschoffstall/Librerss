import {
  enterPreviewFromLogin,
  gotoPreviewDashboard,
  locateViewportArticle,
  openDashboardSettings,
  openDashboardSettingsTab,
  readArticleKey,
  readFeedViewportMetrics,
  setFeedViewportScrollTop,
} from "./helpers";
import { expect, test } from "./test";

function createPreviewSearchTerm(title: string) {
  const candidate = title
    .split(/[^A-Za-z0-9]+/u)
    .map((token) => token.trim())
    .find((token) => token.length >= 5);

  if (!candidate) {
    throw new Error(
      "Expected the preview article title to include a searchable token.",
    );
  }

  return candidate;
}

async function measureVisibleToolbarButton(
  page: Parameters<typeof gotoPreviewDashboard>[0],
  label: string,
) {
  const button = page.locator(`button[aria-label="${label}"]:visible`).first();
  await expect(button).toBeVisible({ timeout: 15_000 });
  const box = await button.boundingBox();

  if (!box) {
    throw new Error(
      `Expected ${label} to resolve to a visible toolbar button.`,
    );
  }

  return { height: box.height, width: box.width };
}

async function openPreviewFeeds(
  page: Parameters<typeof gotoPreviewDashboard>[0],
) {
  const openFeedsButton = page.getByRole("button", { name: "Open feeds" });
  if (await openFeedsButton.isVisible()) {
    await openFeedsButton.click();
  }
}

function previewFeedButton(
  page: Parameters<typeof gotoPreviewDashboard>[0],
  feedName: string,
) {
  const escapedFeedName = feedName.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return page
    .locator("button:visible")
    .filter({
      has: page.locator("p", {
        hasText: new RegExp(`^${escapedFeedName}$`),
      }),
    })
    .first();
}

async function selectPreviewSource(
  page: Parameters<typeof gotoPreviewDashboard>[0],
) {
  const openFeedsButton = page.getByRole("button", { name: "Open feeds" });
  if (await openFeedsButton.isVisible()) {
    await openFeedsButton.click();
  }

  await page.getByRole("button", { name: "Placeholder Feeds" }).click();
}

test.describe("dashboard preview mode", () => {
  test.describe.configure({ mode: "serial" });

  test("opens the mobile actions popup from the three-dots toolbar button", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 820, width: 390 });
    await gotoPreviewDashboard(page);

    const actionsTrigger = page.getByRole("button", {
      name: "Open actions menu",
    });
    await expect(actionsTrigger).toBeVisible({ timeout: 15_000 });

    await actionsTrigger.click();

    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("keeps mobile toolbar button footprints aligned with the desktop uncondensed buttons", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1280 });
    await gotoPreviewDashboard(page);

    const desktopActionFootprint = await measureVisibleToolbarButton(
      page,
      "Refresh selected feed",
    );
    const desktopIconFootprint = await measureVisibleToolbarButton(
      page,
      "Open dashboard settings",
    );

    await page.setViewportSize({ height: 820, width: 390 });
    await gotoPreviewDashboard(page);

    expect(
      await measureVisibleToolbarButton(page, "Refresh selected feed"),
    ).toEqual(desktopActionFootprint);
    expect(
      await measureVisibleToolbarButton(
        page,
        "Mark fully visible articles as read",
      ),
    ).toEqual(desktopActionFootprint);
    expect(await measureVisibleToolbarButton(page, "Open feeds")).toEqual(
      desktopIconFootprint,
    );
    expect(
      await measureVisibleToolbarButton(page, "Open actions menu"),
    ).toEqual(desktopIconFootprint);
  });

  test("enters preview from the login view and signs out back to landing", async ({
    page,
  }) => {
    await enterPreviewFromLogin(page);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/landing$/);
    await expect(
      page.getByRole("link", { name: /Open Dashboard/i }),
    ).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByText("Sign in to LibreRSS")).toBeVisible();
  });

  test("supports safe local article interactions and filtering in preview", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    const firstArticle = await locateViewportArticle(page, 0);
    const firstArticleKey = await readArticleKey(firstArticle);

    const firstTitle = (
      await firstArticle.getByRole("heading").first().textContent()
    )?.trim();
    if (!firstTitle) {
      throw new Error("Expected the first preview article to have a title.");
    }

    await page
      .getByPlaceholder("Search...")
      .fill(createPreviewSearchTerm(firstTitle));
    await expect(
      page.getByRole("heading", {
        name: firstTitle,
      }),
    ).toBeVisible();

    await page.getByPlaceholder("Search...").fill("");
    const restoredArticle = await locateViewportArticle(page, 0);
    await expect(restoredArticle).toContainText(firstTitle);
    await expect(restoredArticle).toBeVisible({ timeout: 15_000 });
    await restoredArticle.getByRole("button", { name: "Star article" }).click();
    await page.getByRole("button", { exact: true, name: "starred" }).click();
    const starredArticle = await locateViewportArticle(page, 0);
    await expect(starredArticle).toBeVisible({
      timeout: 15_000,
    });
    await expect(starredArticle).toContainText(firstTitle);

    await page.getByRole("button", { exact: true, name: "all" }).click();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(
      (await locateViewportArticle(page, 0)).getByRole("button", {
        name: "Mark as unread",
      }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "read" }).click();
    const readArticle = await locateViewportArticle(page, 0);
    await expect(readArticle).toBeVisible({
      timeout: 15_000,
    });
    await expect(readArticle).toContainText(firstTitle);
  });

  test("keeps the selected token and resets the viewport when switching preview sources", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);

    const allButton = page.getByRole("button", { exact: true, name: "all" });
    const unreadButton = page.getByRole("button", {
      exact: true,
      name: "unread",
    });

    await allButton.click();
    await expect(allButton).toHaveAttribute("aria-pressed", "true");

    const { clientHeight, scrollHeight } = await readFeedViewportMetrics(page);
    const targetScrollTop = Math.max(
      0,
      Math.min(900, scrollHeight - clientHeight - 24),
    );

    if (targetScrollTop > 0) {
      await setFeedViewportScrollTop(page, targetScrollTop);
    }

    const initialScrollTop = (await readFeedViewportMetrics(page)).scrollTop;

    await selectPreviewSource(page);
    await expect(await locateViewportArticle(page, 0)).toBeVisible({
      timeout: 15_000,
    });
    await expect(allButton).toHaveAttribute("aria-pressed", "true");
    await expect(unreadButton).toHaveAttribute("aria-pressed", "false");

    await unreadButton.click();
    await expect(await locateViewportArticle(page, 0)).toBeVisible({
      timeout: 15_000,
    });
    await expect(unreadButton).toHaveAttribute("aria-pressed", "true");
  });

  test("opens settings and shows demo safeguards in preview mode", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);

    await openDashboardSettings(page);
    await expect(page.getByLabel("Show favicons")).toBeVisible();
    await expect(page.getByLabel("Auto refresh")).toBeVisible();
    await openDashboardSettingsTab(page, "Feeds");
    await expect(page.getByText("Not available in demo mode")).toHaveCount(1);
  });

  test("shows the expanded placeholder feed catalog in preview mode", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await openPreviewFeeds(page);
    await selectPreviewSource(page);

    await expect(previewFeedButton(page, "NIH News Releases")).toBeVisible();
    await expect(previewFeedButton(page, "NIH Research Matters")).toBeVisible();
    await expect(previewFeedButton(page, "NHLBI All News")).toBeVisible();
    await expect(previewFeedButton(page, "NINDS Press Releases")).toBeVisible();
    await expect(
      previewFeedButton(page, "ESA Earth Observation"),
    ).toBeVisible();
    await expect(
      previewFeedButton(page, "ESA Human Exploration"),
    ).toBeVisible();
    await expect(previewFeedButton(page, "ESA Top News")).toBeVisible();
    await expect(previewFeedButton(page, "NASA Breaking News")).toBeVisible();
    await expect(previewFeedButton(page, "NASA STEM Learning")).toBeVisible();
    await expect(
      page.locator("button").filter({ hasText: "ESA Images" }),
    ).toHaveCount(0);
    await expect(
      page.locator("button").filter({ hasText: "NASA Image of the Day" }),
    ).toHaveCount(0);

    const nihResearchMattersButton = previewFeedButton(
      page,
      "NIH Research Matters",
    );
    await expect(nihResearchMattersButton).toBeVisible();
    await nihResearchMattersButton.evaluate((button) => {
      if (!(button instanceof HTMLElement)) {
        throw new Error("Expected a feed button element.");
      }

      button.click();
    });
    await expect(
      page.getByRole("heading", {
        name: /Treating addiction/i,
      }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
