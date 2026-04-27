import { gotoPreviewDashboard } from "./helpers";
import { expect, test } from "./test";

test("preview dashboard does not request Google favicon provider URLs", async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  const handleRequest = (request: { url: () => string }) => {
    requestedUrls.push(request.url());
  };

  page.on("request", handleRequest);

  try {
    await gotoPreviewDashboard(page);
    const requestCountAtDashboardReady = requestedUrls.length;

    await expect
      .poll(() => {
        return requestedUrls.length;
      }, {
        intervals: [100, 150, 200],
        timeout: 800,
      })
      .toBeGreaterThanOrEqual(requestCountAtDashboardReady);
  } finally {
    page.off("request", handleRequest);
  }

  const googleFaviconRequests = requestedUrls.filter((url) => {
    return /google(?:usercontent)?\.com\/s2\/favicons|gstatic\.com\/faviconV2/iu.test(
      url,
    );
  });

  expect(googleFaviconRequests).toEqual([]);
});
