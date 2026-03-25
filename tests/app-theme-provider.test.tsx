import { describe, expect, test } from "bun:test";

import {
  mobileToastViewportOffset,
  toastViewportOffset,
} from "@/components/toast-viewport-offset";

describe("toast viewport offsets", () => {
  test("keep Sonner below the fixed dashboard header on desktop and mobile", () => {
    expect(toastViewportOffset).toEqual({
      left: 16,
      right: 16,
      top: 63,
    });
    expect(mobileToastViewportOffset).toEqual({
      left: 16,
      right: 16,
      top: 63,
    });
  });
});