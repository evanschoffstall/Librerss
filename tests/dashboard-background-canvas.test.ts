import { describe, expect, test } from "bun:test";

import {
  BACKGROUND_CANVAS_BASELINE_FRAME_MS,
  BACKGROUND_CANVAS_MAX_DPR,
  BACKGROUND_CANVAS_TARGET_FRAME_MS,
  getBackgroundCanvasLerpFactor,
  getBackgroundCanvasScale,
  getBackgroundParallaxOffset,
  getVisibleBackgroundCanvasElementSize,
  shouldRenderBackgroundCanvasFrame,
  shouldRunBackgroundAnimation,
} from "../src/app/dashboard/dashboard-components/background-internals/background-canvas";

describe("dashboard background canvas helpers", () => {
  test("caps device pixel ratio for decorative canvases", () => {
    expect(getBackgroundCanvasScale(undefined)).toBe(1);
    expect(getBackgroundCanvasScale(0.5)).toBe(1);
    expect(getBackgroundCanvasScale(1.25)).toBe(1.25);
    expect(getBackgroundCanvasScale(4)).toBe(BACKGROUND_CANVAS_MAX_DPR);
  });

  test("rejects suspended-page zero-size canvas measurements", () => {
    const container = document.createElement("div");
    Object.defineProperties(container, {
      offsetHeight: {
        configurable: true,
        value: 0,
      },
      offsetWidth: {
        configurable: true,
        value: 0,
      },
    });

    expect(getVisibleBackgroundCanvasElementSize(container)).toBeNull();

    Object.defineProperties(container, {
      offsetHeight: {
        configurable: true,
        value: 120,
      },
      offsetWidth: {
        configurable: true,
        value: 240,
      },
    });

    expect(getVisibleBackgroundCanvasElementSize(container)).toEqual({
      height: 120,
      width: 240,
    });
  });

  test("throttles frames to the configured budget", () => {
    expect(shouldRenderBackgroundCanvasFrame(0, 5)).toBe(true);
    expect(
      shouldRenderBackgroundCanvasFrame(
        100,
        100 + BACKGROUND_CANVAS_TARGET_FRAME_MS - 1,
      ),
    ).toBe(false);
    expect(
      shouldRenderBackgroundCanvasFrame(
        100,
        100 + BACKGROUND_CANVAS_TARGET_FRAME_MS,
      ),
    ).toBe(true);
  });

  test("runs animation only when visible and motion is allowed", () => {
    expect(shouldRunBackgroundAnimation("visible", false)).toBe(true);
    expect(shouldRunBackgroundAnimation("hidden", false)).toBe(false);
    expect(shouldRunBackgroundAnimation("visible", true)).toBe(false);
  });

  test("keeps slower interpolation while following the pointer direction", () => {
    expect(
      getBackgroundCanvasLerpFactor(210, BACKGROUND_CANVAS_BASELINE_FRAME_MS),
    ).toBeLessThan(
      getBackgroundCanvasLerpFactor(50, BACKGROUND_CANVAS_BASELINE_FRAME_MS),
    );

    expect(getBackgroundParallaxOffset(100, 18, 2, 2.2)).toBeCloseTo(
      24.4444444444,
      6,
    );
    expect(getBackgroundParallaxOffset(-100, 18, 2, 2.2)).toBeCloseTo(
      -24.4444444444,
      6,
    );
  });
});
