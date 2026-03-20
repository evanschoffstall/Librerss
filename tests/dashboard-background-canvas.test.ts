import { act, render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";

import { ParticlesBackground } from "@/app/dashboard/components/Background";
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

  test("fades the full decorative surface in on the first animation frame", async () => {
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalWindowCancelAnimationFrame = window.cancelAnimationFrame;
    const originalWindowRequestAnimationFrame = window.requestAnimationFrame;
    const scheduledFrames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;

    const scheduleAnimationFrame = (callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      scheduledFrames.set(frameId, callback);
      return frameId;
    };
    const cancelScheduledAnimationFrame = (frameId: number) => {
      scheduledFrames.delete(frameId);
    };

    global.requestAnimationFrame =
      scheduleAnimationFrame as typeof requestAnimationFrame;
    global.cancelAnimationFrame =
      cancelScheduledAnimationFrame as typeof cancelAnimationFrame;
    window.requestAnimationFrame =
      scheduleAnimationFrame as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame =
      cancelScheduledAnimationFrame as typeof window.cancelAnimationFrame;

    try {
      const { container } = render(
        createElement(ParticlesBackground, { quantity: 1 }),
      );
      const backgroundSurface = container.querySelector<HTMLElement>(
        '[data-background-surface="true"]',
      );

      expect(backgroundSurface).toBeTruthy();
      expect(backgroundSurface?.className).toContain("opacity-0");
      expect(backgroundSurface?.className).not.toContain("opacity-100");
      expect(
        container.querySelector('[data-background-gradient-tone="dark"]'),
      ).toBeTruthy();
      expect(
        container.querySelector('[data-background-animation-layer="particles"]'),
      ).toBeTruthy();

      const initialFrameCallbacks = [...scheduledFrames.values()];

      expect(initialFrameCallbacks.length).toBeGreaterThan(0);

      await act(async () => {
        for (const callback of initialFrameCallbacks) {
          callback(16);
        }
      });

      expect(backgroundSurface?.className).toContain("opacity-100");
      expect(backgroundSurface?.className).not.toContain("opacity-0");
    } finally {
      global.cancelAnimationFrame = originalCancelAnimationFrame;
      global.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalWindowCancelAnimationFrame;
      window.requestAnimationFrame = originalWindowRequestAnimationFrame;
    }
  });
});
