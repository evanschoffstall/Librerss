import { describe, expect, test } from "bun:test";
import { isValidElement, type ReactElement } from "react";

import GlobalError from "@/app/global-error";

/**
 * Narrow the rendered element tree for the root-document global error page.
 *
 * The component returns `<html>` and `<body>` directly, so inspecting the
 * element structure is more reliable than mounting it into a nested test DOM.
 */
function assertReactElement(value: unknown) {
  expect(isValidElement(value)).toBe(true);

  if (!isValidElement(value)) {
    throw new Error("Expected a valid React element.");
  }

  return value as ReactElement<Record<string, unknown>>;
}

describe("global error page", () => {
  test("forces the root document into the dark theme shell", () => {
    const renderedPage = assertReactElement(
      GlobalError({
        error: new Error("fatal render failure"),
        reset: () => undefined,
      }),
    );

    expect(renderedPage.type).toBe("html");
    expect(renderedPage.props.className).toBe("dark");
    expect(renderedPage.props.suppressHydrationWarning).toBe(true);

    const bodyElement = assertReactElement(renderedPage.props.children);

    expect(bodyElement.type).toBe("body");
    expect(String(bodyElement.props.className)).toContain("dark");
  });
});
