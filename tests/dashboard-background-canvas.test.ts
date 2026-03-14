import { describe, expect, test } from "bun:test";

import {
  BACKGROUND_CANVAS_MAX_DPR,
  BACKGROUND_CANVAS_TARGET_FRAME_MS,
  getBackgroundCanvasScale,
  shouldRenderBackgroundCanvasFrame,
  shouldRunBackgroundAnimation,
} from "@/app/dashboard/components/background-canvas";

describe("dashboard background canvas helpers", () => {
  test("caps device pixel ratio for decorative canvases", () => {
    expect(getBackgroundCanvasScale(undefined)).toBe(1);
    expect(getBackgroundCanvasScale(0.5)).toBe(1);
    expect(getBackgroundCanvasScale(1.25)).toBe(1.25);
    expect(getBackgroundCanvasScale(4)).toBe(BACKGROUND_CANVAS_MAX_DPR);
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
});
