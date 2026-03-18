import { test } from '@playwright/test';

test('visual probe: capture rapid screenshots during button-read removal', async ({ page }) => {
  await page.goto('/dashboard?explore=1');
  await page.waitForTimeout(2000);
  await page.click('button:has-text("unread")');
  await page.waitForTimeout(1200);
  
  // Before screenshot
  await page.screenshot({ path: 'test-results/vis-00-before.png' });
  
  // Find the read button on the first article
  const firstReadBtn = page.locator('[data-scroll-restore-key] [aria-label="Mark as read"]').first();
  await firstReadBtn.click();
  
  // Rapid screenshots
  await page.screenshot({ path: 'test-results/vis-01-t0.png' });
  await page.waitForTimeout(16);
  await page.screenshot({ path: 'test-results/vis-02-t16.png' });
  await page.waitForTimeout(16);
  await page.screenshot({ path: 'test-results/vis-03-t32.png' });
  await page.waitForTimeout(16);
  await page.screenshot({ path: 'test-results/vis-04-t48.png' });
  await page.waitForTimeout(32);
  await page.screenshot({ path: 'test-results/vis-05-t80.png' });
  await page.waitForTimeout(70);
  await page.screenshot({ path: 'test-results/vis-06-t150.png' });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'test-results/vis-07-t250.png' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/vis-08-t400.png' });
  
  // Now SECOND read on the now-top article
  const secondReadBtn = page.locator('[data-scroll-restore-key] [aria-label="Mark as read"]').first();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/vis-10-before2.png' });
  await secondReadBtn.click();
  await page.screenshot({ path: 'test-results/vis-11-click2-t0.png' });
  await page.waitForTimeout(16);
  await page.screenshot({ path: 'test-results/vis-12-click2-t16.png' });
  await page.waitForTimeout(16);
  await page.screenshot({ path: 'test-results/vis-13-click2-t32.png' });
  await page.waitForTimeout(16);
  await page.screenshot({ path: 'test-results/vis-14-click2-t48.png' });
  await page.waitForTimeout(32);
  await page.screenshot({ path: 'test-results/vis-15-click2-t80.png' });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'test-results/vis-16-click2-t180.png' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/vis-17-click2-t380.png' });
});
