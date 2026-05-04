import { gotoPreviewDashboard } from "./helpers";
import { expect, test } from "./test";

const DIRECT_FAVICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <rect width="16" height="16" fill="#ffffff"/>
  <circle cx="8" cy="8" r="5" fill="#111111"/>
</svg>
`;

test("preview dashboard avoids weak favicon providers when fast candidates load", async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  const handleRequest = (request: { url: () => string }) => {
    requestedUrls.push(request.url());
  };

  await page.route(/icons\.duckduckgo\.com\/ip3\//u, async (route) => {
    await route.fulfill({
      body: DIRECT_FAVICON_SVG,
      contentType: "image/svg+xml",
      status: 200,
    });
  });

  page.on("request", handleRequest);

  try {
    await gotoPreviewDashboard(page);
    const requestCountAtDashboardReady = requestedUrls.length;

    await expect
      .poll(
        () => {
          return requestedUrls.length;
        },
        {
          intervals: [100, 150, 200],
          timeout: 800,
        },
      )
      .toBeGreaterThanOrEqual(requestCountAtDashboardReady);
  } finally {
    page.off("request", handleRequest);
  }

  const googleFaviconRequests = requestedUrls.filter((url) => {
    return /google(?:usercontent)?\.com\/s2\/favicons|gstatic\.com\/faviconV2/iu.test(
      url,
    );
  });
  const providerFaviconRequests = requestedUrls.filter((url) => {
    return /icon\.horse\/icon\//iu.test(url);
  });
  const fastProviderFaviconRequests = requestedUrls.filter((url) => {
    return /icons\.duckduckgo\.com\/ip3\//iu.test(url);
  });
  const faviconBackings = await page
    .locator("button img[src*='icons.duckduckgo.com/ip3/']")
    .evaluateAll((images) => {
      return images.map((image) => {
        const style = getComputedStyle(image);
        return {
          backgroundColor: style.backgroundColor,
          height: style.height,
          objectFit: style.objectFit,
          paddingTop: style.paddingTop,
          width: style.width,
        };
      });
    });

  expect(fastProviderFaviconRequests.length).toBeGreaterThan(0);
  expect(faviconBackings.length).toBeGreaterThan(0);
  expect(
    faviconBackings.every((backing) => {
      return (
        /rgba?\(255, 255, 255(?:, 0\.5)?\)|color\(srgb 1 1 1 \/ 0\.5\)|oklab\([^)]*\/ 0\.5\)/u.test(
          backing.backgroundColor,
        ) &&
        backing.height === "14px" &&
        backing.objectFit === "contain" &&
        backing.paddingTop === "0px" &&
        backing.width === "14px"
      );
    }),
  ).toBe(true);
  expect(providerFaviconRequests).toEqual([]);
  expect(googleFaviconRequests).toEqual([]);
});
