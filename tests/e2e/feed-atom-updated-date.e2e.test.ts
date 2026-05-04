import type { Page } from "@playwright/test";

import Parser from "rss-parser";

import {
  FEED_PARSER_CUSTOM_FIELDS,
  toPendingArticle,
} from "@/lib/core/feed-parser";

import { articleCard } from "./helpers";
import { expect, test } from "./test";

const FIXED_REFRESH_NOW = "2026-05-03T17:10:00.000Z";
const IFL_SCIENCE_FEED_URL =
  "https://www.iflscience.com/rss/ifls-latest-rss.xml";
const IFL_SCIENCE_ATOM_UPDATED_ITEM_XML = `
<rss version="2.0" xmlns:a10="http://www.w3.org/2005/Atom">
  <channel>
    <item>
      <guid isPermaLink="false">the-moon-illusion-still-hasnt-been-solved-after-thousands-of-years-83384</guid>
      <link>https://www.iflscience.com/the-moon-illusion-still-hasnt-been-solved-after-thousands-of-years-83384</link>
      <title>The Moon Illusion Still Hasn't Been Solved After Thousands Of Years</title>
      <description>NASA takes a surprisingly chill approach to the dilemma.</description>
      <a10:updated>2026-05-01T15:28:44Z</a10:updated>
      <a10:content type="html"><![CDATA[ ]]></a10:content>
    </item>
  </channel>
</rss>`;
const JACOBIN_ATOM_ID_ONLY_ITEM_XML = `
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Jacobin</title>
  <entry>
    <id>https://jacobin.com/2026/05/mazzocchi-labor-party-antiwar-osha</id>
    <title type="text">Tony Mazzocchi Embodied the Best of the Labor Movement</title>
    <updated>2026-05-03T15:56:47.507815Z</updated>
    <published>2026-05-03T15:56:47.507815Z</published>
    <summary type="text">Labor history summary.</summary>
  </entry>
</feed>`;

/**
 * Freezes the browser clock so relative article labels produce deterministic
 * text for the Atom-updated regression path.
 * @param fixedNowIso - ISO timestamp used as the browser's current time.
 * @returns Browser-side script source installed before dashboard navigation.
 */
function buildFrozenDateInitScript(fixedNowIso: string): string {
  return `(() => {
    const fixedNow = new Date(${JSON.stringify(fixedNowIso)}).getTime();
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length === 0 ? [fixedNow] : args));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = NativeDate.UTC;
    FixedDate.parse = NativeDate.parse;
    globalThis.Date = FixedDate;
  })();`;
}

/**
 * Opens the real dashboard route so mocked session, feed, and batch API
 * responses drive the visible article list instead of explore-mode placeholders
 * or shared login rate-limit state.
 * @param page - Playwright page that owns the browser session.
 */
async function gotoMockedDashboard(page: Page): Promise<void> {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
}

test.describe("feed Atom updated dates", () => {
  test("renders an Atom updated RSS item with its upstream date instead of refresh time", async ({
    page,
  }) => {
    const parsedFeed = await new Parser({
      customFields: FEED_PARSER_CUSTOM_FIELDS,
    }).parseString(IFL_SCIENCE_ATOM_UPDATED_ITEM_XML);
    const parsedItem = parsedFeed.items[0];

    if (!parsedItem) {
      throw new Error("Expected the IFLScience fixture to parse one item.");
    }

    const pendingArticle = toPendingArticle(
      parsedItem,
      1,
      new Date(FIXED_REFRESH_NOW),
    );

    if (!pendingArticle) {
      throw new Error("Expected the IFLScience fixture to map to an article.");
    }

    await page.addInitScript(buildFrozenDateInitScript(FIXED_REFRESH_NOW));
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          allowSignup: false,
          authenticated: true,
          usePlaceholderData: false,
          user: { email: "atom-updated-date@example.test", id: 1 },
        }),
        contentType: "application/json",
        status: 200,
      });
    });
    await page.route("**/api/feeds", async (route) => {
      await route.fulfill({
        body: JSON.stringify([
          {
            category: "Science",
            enabled: true,
            extractionDisabled: true,
            id: 1,
            name: "IFLScience",
            proxyEnabled: false,
            url: IFL_SCIENCE_FEED_URL,
          },
        ]),
        contentType: "application/json",
        status: 200,
      });
    });
    await page.route("**/api/feeds/category-order", async (route) => {
      await route.fulfill({
        body: JSON.stringify({ orderedLabels: ["Science"] }),
        contentType: "application/json",
        status: 200,
      });
    });
    await page.route("**/api/feeds/batch", async (route) => {
      const requestBody = route.request().postDataJSON() as { urls?: string[] };
      const urls = Array.isArray(requestBody.urls) ? requestBody.urls : [];

      await route.fulfill({
        body: JSON.stringify(
          urls.map((url, feedIndex) => ({
            articles:
              feedIndex === 0
                ? [
                    {
                      content: pendingArticle.content,
                      feedId: 1,
                      feedUrl: url,
                      hasFullContent: false,
                      id: 83_384,
                      isRead: false,
                      isStarred: false,
                      lastChecked: FIXED_REFRESH_NOW,
                      link: pendingArticle.link,
                      publicationDate:
                        pendingArticle.publicationDate.toISOString(),
                      title: pendingArticle.title,
                    },
                  ]
                : [],
            ok: true,
            url,
          })),
        ),
        contentType: "application/json",
        status: 200,
      });
    });

    await gotoMockedDashboard(page);

    const firstArticle = articleCard(page, 0);
    await expect(firstArticle.getByRole("heading")).toHaveText(
      "The Moon Illusion Still Hasn't Been Solved After Thousands Of Years",
    );
    await expect(firstArticle).toContainText("2 days ago");
    await expect(firstArticle).not.toContainText("Today");
  });

  test("renders an Atom id-only entry instead of dropping it as linkless", async ({
    page,
  }) => {
    const parsedFeed = await new Parser({
      customFields: FEED_PARSER_CUSTOM_FIELDS,
    }).parseString(JACOBIN_ATOM_ID_ONLY_ITEM_XML);
    const parsedItem = parsedFeed.items[0];

    if (!parsedItem) {
      throw new Error("Expected the Jacobin fixture to parse one Atom entry.");
    }

    const pendingArticle = toPendingArticle(
      parsedItem,
      1,
      new Date(FIXED_REFRESH_NOW),
    );

    if (!pendingArticle) {
      throw new Error(
        "Expected the Jacobin Atom id fixture to map to an article.",
      );
    }

    await page.addInitScript(buildFrozenDateInitScript(FIXED_REFRESH_NOW));
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          allowSignup: false,
          authenticated: true,
          usePlaceholderData: false,
          user: { email: "atom-id-only@example.test", id: 1 },
        }),
        contentType: "application/json",
        status: 200,
      });
    });
    await page.route("**/api/feeds", async (route) => {
      await route.fulfill({
        body: JSON.stringify([
          {
            category: "Politics",
            enabled: true,
            extractionDisabled: true,
            id: 1,
            name: "Jacobin",
            proxyEnabled: false,
            url: "https://jacobin.com/feed",
          },
        ]),
        contentType: "application/json",
        status: 200,
      });
    });
    await page.route("**/api/feeds/category-order", async (route) => {
      await route.fulfill({
        body: JSON.stringify({ orderedLabels: ["Politics"] }),
        contentType: "application/json",
        status: 200,
      });
    });
    await page.route("**/api/feeds/batch", async (route) => {
      const requestBody = route.request().postDataJSON() as { urls?: string[] };
      const urls = Array.isArray(requestBody.urls) ? requestBody.urls : [];

      await route.fulfill({
        body: JSON.stringify(
          urls.map((url, feedIndex) => ({
            articles:
              feedIndex === 0
                ? [
                    {
                      content: pendingArticle.content,
                      feedId: 1,
                      feedUrl: url,
                      hasFullContent: false,
                      id: 202_605_03,
                      isRead: false,
                      isStarred: false,
                      lastChecked: FIXED_REFRESH_NOW,
                      link: pendingArticle.link,
                      publicationDate:
                        pendingArticle.publicationDate.toISOString(),
                      title: pendingArticle.title,
                    },
                  ]
                : [],
            ok: true,
            url,
          })),
        ),
        contentType: "application/json",
        status: 200,
      });
    });

    await gotoMockedDashboard(page);

    const firstArticle = articleCard(page, 0);
    await expect(firstArticle.getByRole("heading")).toHaveText(
      "Tony Mazzocchi Embodied the Best of the Labor Movement",
    );
    await expect(firstArticle).toHaveAttribute(
      "data-article-key",
      "https://jacobin.com/2026/05/mazzocchi-labor-party-antiwar-osha",
    );
  });
});
