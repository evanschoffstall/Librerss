import type { Locator, Page } from "@playwright/test";

import { expect } from "./test";

/** Supported dashboard background modes covered by universal rendering tests. */
export type DashboardBackgroundTestMode = "particles" | "stars";

/** A compact numeric fingerprint of the pixels currently painted into a canvas. */
interface CanvasMotionSignature {
  alphaCentroidX: number;
  alphaCentroidY: number;
  alphaSum: number;
  nonBlankPixelCount: number;
  pixelHash: number;
}

/** Options controlling how much pixel movement proves a background changed. */
interface CanvasSignatureChangeOptions {
  minAlphaDelta?: number;
  minCentroidShift?: number;
}

/** Result returned by the in-page signature polling loop. */
interface CanvasSignatureChangeResult {
  changed: boolean;
  currentSignature: CanvasMotionSignature;
}

const BACKGROUND_CANVAS_SELECTOR_BY_MODE = {
  particles: '[data-background-animation-layer="particles"] canvas',
  stars: '[data-background-animation-layer="stars"] canvas',
} satisfies Record<DashboardBackgroundTestMode, string>;
const DEFAULT_SIGNATURE_CHANGE_OPTIONS = {
  minAlphaDelta: 24,
  minCentroidShift: 0.04,
} satisfies Required<CanvasSignatureChangeOptions>;
const MAX_SIGNATURE_WAIT_FRAMES = 360;

/**
 * Return the canvas locator for the active dashboard background mode.
 * @param page - The Playwright page containing the dashboard.
 * @param backgroundMode - The dashboard background mode whose canvas is needed.
 * @returns The canvas locator for the selected background mode.
 */
export function dashboardBackgroundCanvas(
  page: Page,
  backgroundMode: DashboardBackgroundTestMode,
) {
  return page
    .locator(BACKGROUND_CANVAS_SELECTOR_BY_MODE[backgroundMode])
    .first();
}

/**
 * Assert that the canvas changes over animation frames without new input,
 * proving particles keep dust-like drift and stars keep ambient twinkle/fade.
 * @param canvas - The canvas locator to inspect.
 * @param baselineSignature - The previously captured canvas signature.
 * @returns The next changed signature after autonomous animation advances.
 */
export async function expectDashboardBackgroundAmbientMotion(
  canvas: Locator,
  baselineSignature: CanvasMotionSignature,
) {
  const signature = await waitForCanvasSignatureChange(
    canvas,
    baselineSignature,
    {
      minAlphaDelta: 12,
      minCentroidShift: 0.02,
    },
  );
  expect(signature.nonBlankPixelCount).toBeGreaterThan(0);

  return signature;
}

/**
 * Assert that the background canvas hydrates, receives a backing buffer, and
 * paints at least one visible pixel rather than mounting as an empty surface.
 * @param canvas - The canvas locator to inspect.
 * @returns The first painted canvas signature for later movement comparison.
 */
export async function expectDashboardBackgroundHydrated(canvas: Locator) {
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const signature = await waitForCanvasSignatureChange(canvas, {
    alphaCentroidX: 0,
    alphaCentroidY: 0,
    alphaSum: 0,
    nonBlankPixelCount: 0,
    pixelHash: 0,
  });

  expect(signature.nonBlankPixelCount).toBeGreaterThan(0);
  expect(signature.alphaSum).toBeGreaterThan(0);

  return signature;
}

/**
 * Move the desktop pointer across the viewport and assert the background canvas
 * changes afterward, proving the pointer parallax path is wired through real
 * Playwright mouse input rather than a synthetic component call.
 * @param page - The Playwright page containing the dashboard.
 * @param canvas - The canvas locator to inspect.
 * @param baselineSignature - The previously captured canvas signature.
 */
export async function expectDashboardBackgroundMouseInteractivity(
  page: Page,
  canvas: Locator,
  baselineSignature: CanvasMotionSignature,
) {
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error("Viewport size unavailable for background mouse probe.");
  }

  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.move((viewport.width * 4) / 5, viewport.height / 5, {
    steps: 8,
  });

  const signature = await waitForCanvasSignatureChange(
    canvas,
    baselineSignature,
    {
      minAlphaDelta: 8,
      minCentroidShift: 0.02,
    },
  );
  expect(signature.nonBlankPixelCount).toBeGreaterThan(0);
}

/**
 * Assert that a dashboard background keeps its last valid canvas geometry when
 * mobile WebKit-style suspension temporarily reports the canvas container as
 * `0x0`, then remeasures and continues painting after page resume.
 * @param page - The Playwright page containing the dashboard.
 * @param canvas - The canvas locator to inspect.
 */
export async function expectDashboardBackgroundSuspensionRecovery(
  _page: Page,
  canvas: Locator,
) {
  const result = await canvas.evaluate(async (canvasElement) => {
    const backgroundCanvas = canvasElement as HTMLCanvasElement;
    const container = backgroundCanvas.parentElement;
    if (!container) {
      throw new Error("Background canvas container is unavailable.");
    }

    const before = {
      cssHeight: backgroundCanvas.style.height,
      cssWidth: backgroundCanvas.style.width,
      height: backgroundCanvas.height,
      width: backgroundCanvas.width,
    };
    const restoredWidth = Number.parseFloat(before.cssWidth);
    const restoredHeight = Number.parseFloat(before.cssHeight);

    Object.defineProperty(container, "offsetWidth", {
      configurable: true,
      get: () => 0,
    });
    Object.defineProperty(container, "offsetHeight", {
      configurable: true,
      get: () => 0,
    });
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    const duringSuspension = {
      cssHeight: backgroundCanvas.style.height,
      cssWidth: backgroundCanvas.style.width,
      height: backgroundCanvas.height,
      width: backgroundCanvas.width,
    };

    Object.defineProperty(container, "offsetWidth", {
      configurable: true,
      get: () => restoredWidth,
    });
    Object.defineProperty(container, "offsetHeight", {
      configurable: true,
      get: () => restoredHeight,
    });
    window.dispatchEvent(new Event("pageshow"));
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });

    return {
      afterResume: {
        cssHeight: backgroundCanvas.style.height,
        cssWidth: backgroundCanvas.style.width,
        height: backgroundCanvas.height,
        width: backgroundCanvas.width,
      },
      before,
      duringSuspension,
    };
  });

  expect(result.before.width).toBeGreaterThan(0);
  expect(result.before.height).toBeGreaterThan(0);
  expect(result.duringSuspension).toEqual(result.before);
  expect(result.afterResume.width).toBe(result.before.width);
  expect(result.afterResume.height).toBe(result.before.height);
  expect(result.afterResume.cssWidth).toBe(result.before.cssWidth);
  expect(result.afterResume.cssHeight).toBe(result.before.cssHeight);

  const resumedSignature = await expectDashboardBackgroundHydrated(canvas);
  expect(resumedSignature.nonBlankPixelCount).toBeGreaterThan(0);
}

/**
 * Tap the mobile viewport and assert the background canvas changes afterward,
 * proving touch-style pointer input reaches the same parallax path on iOS and
 * other touch-first browser profiles.
 * @param page - The Playwright page containing the dashboard.
 * @param canvas - The canvas locator to inspect.
 * @param baselineSignature - The previously captured canvas signature.
 */
export async function expectDashboardBackgroundTouchInteractivity(
  page: Page,
  canvas: Locator,
  baselineSignature: CanvasMotionSignature,
) {
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error("Viewport size unavailable for background touch probe.");
  }

  await page.touchscreen.tap((viewport.width * 4) / 5, viewport.height / 5);

  const signature = await waitForCanvasSignatureChange(
    canvas,
    baselineSignature,
    {
      minAlphaDelta: 8,
      minCentroidShift: 0.02,
    },
  );
  expect(signature.nonBlankPixelCount).toBeGreaterThan(0);
}

/**
 * Open the explore dashboard with a specific background mode persisted before
 * hydration starts so the tested canvas is the one mounted by the real router.
 * @param page - The Playwright page used for the test.
 * @param backgroundMode - The dashboard background mode to activate.
 */
export async function gotoDashboardWithBackgroundMode(
  page: Page,
  backgroundMode: DashboardBackgroundTestMode,
) {
  await page.addInitScript((mode) => {
    window.localStorage.setItem(
      "librerss:backgroundMode",
      JSON.stringify(mode),
    );
  }, backgroundMode);
  await page.goto("/dashboard?explore=1", { waitUntil: "domcontentloaded" });
}

/**
 * Wait until the canvas signature differs from a baseline within a bounded
 * number of requestAnimationFrame turns. The polling runs in the browser so it
 * samples exactly what the user-facing canvas paints between frames.
 * @param canvas - The canvas locator to inspect.
 * @param baselineSignature - The signature that should become stale.
 * @param options - Thresholds used to decide that the canvas moved.
 * @returns The first signature that differs enough from the baseline.
 */
async function waitForCanvasSignatureChange(
  canvas: Locator,
  baselineSignature: CanvasMotionSignature,
  options: CanvasSignatureChangeOptions = {},
) {
  const result = await canvas.evaluate(
    (element, evaluationOptions) =>
      new Promise<CanvasSignatureChangeResult>((resolve) => {
        const canvasElement = element as HTMLCanvasElement;
        let frameCount = 0;

        /** Captures a compact signature from the current canvas pixels. */
        const readSignature = (): CanvasMotionSignature => {
          const context = canvasElement.getContext("2d");
          if (
            !context ||
            canvasElement.width === 0 ||
            canvasElement.height === 0
          ) {
            return {
              alphaCentroidX: 0,
              alphaCentroidY: 0,
              alphaSum: 0,
              nonBlankPixelCount: 0,
              pixelHash: 0,
            };
          }

          const imageData = context.getImageData(
            0,
            0,
            canvasElement.width,
            canvasElement.height,
          );
          let alphaSum = 0;
          let nonBlankPixelCount = 0;
          let pixelHash = 0;
          let weightedX = 0;
          let weightedY = 0;
          const width = canvasElement.width;

          for (
            let pixelIndex = 0;
            pixelIndex < imageData.data.length;
            pixelIndex += 4
          ) {
            pixelHash =
              (pixelHash +
                (imageData.data[pixelIndex] ?? 0) * 3 +
                (imageData.data[pixelIndex + 1] ?? 0) * 5 +
                (imageData.data[pixelIndex + 2] ?? 0) * 7 +
                (imageData.data[pixelIndex + 3] ?? 0) * 11 +
                pixelIndex) %
              1_000_000_007;
            const alpha = imageData.data[pixelIndex + 3] ?? 0;
            if (alpha === 0) {
              continue;
            }

            const pixelNumber = pixelIndex / 4;
            const x = pixelNumber % width;
            const y = Math.floor(pixelNumber / width);
            alphaSum += alpha;
            nonBlankPixelCount += 1;
            weightedX += x * alpha;
            weightedY += y * alpha;
          }

          return {
            alphaCentroidX: alphaSum > 0 ? weightedX / alphaSum : 0,
            alphaCentroidY: alphaSum > 0 ? weightedY / alphaSum : 0,
            alphaSum,
            nonBlankPixelCount,
            pixelHash,
          };
        };

        /** Returns whether the current signature proves visible canvas motion. */
        const hasChanged = (currentSignature: CanvasMotionSignature) => {
          const alphaDelta = Math.abs(
            currentSignature.alphaSum -
              evaluationOptions.baselineSignature.alphaSum,
          );
          const centroidShift = Math.hypot(
            currentSignature.alphaCentroidX -
              evaluationOptions.baselineSignature.alphaCentroidX,
            currentSignature.alphaCentroidY -
              evaluationOptions.baselineSignature.alphaCentroidY,
          );
          const hasPixelHashChanged =
            currentSignature.pixelHash !==
            evaluationOptions.baselineSignature.pixelHash;

          return (
            currentSignature.nonBlankPixelCount > 0 &&
            (hasPixelHashChanged ||
              alphaDelta >= evaluationOptions.minAlphaDelta ||
              centroidShift >= evaluationOptions.minCentroidShift)
          );
        };

        /** Polls on animation frames until the canvas moves or the budget ends. */
        const pollSignature = () => {
          const currentSignature = readSignature();
          if (
            hasChanged(currentSignature) ||
            frameCount >= evaluationOptions.maxFrameCount
          ) {
            resolve({
              changed: hasChanged(currentSignature),
              currentSignature,
            });
            return;
          }

          frameCount += 1;
          window.requestAnimationFrame(pollSignature);
        };

        pollSignature();
      }),
    {
      baselineSignature,
      maxFrameCount: MAX_SIGNATURE_WAIT_FRAMES,
      minAlphaDelta:
        options.minAlphaDelta ?? DEFAULT_SIGNATURE_CHANGE_OPTIONS.minAlphaDelta,
      minCentroidShift:
        options.minCentroidShift ??
        DEFAULT_SIGNATURE_CHANGE_OPTIONS.minCentroidShift,
    },
  );

  expect(result.changed).toBe(true);

  return result.currentSignature;
}
