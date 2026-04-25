import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let componentImportVersion = 0;

async function loadDevAutoLoginRedirect() {
  componentImportVersion += 1;
  return import(
    `@/app/dashboard/components/login/DevAutoLoginRedirect?test-version=${componentImportVersion}`
  );
}

describe("DevAutoLoginRedirect", () => {
  const originalLocationReplace = window.location.replace;

  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
    Object.defineProperty(window.location, "replace", {
      configurable: true,
      value: originalLocationReplace,
      writable: true,
    });
  });

  test("hard-navigates to the current-origin auto-login route", async () => {
    const replace = mock(() => undefined);

    Object.defineProperty(window.location, "replace", {
      configurable: true,
      value: replace,
      writable: true,
    });

    const { DevAutoLoginRedirect } = await loadDevAutoLoginRedirect();
    render(
      <DevAutoLoginRedirect autoLoginPath="/api/auth/dev-login?returnTo=%2Fdashboard" />,
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        "/api/auth/dev-login?returnTo=%2Fdashboard",
      );
    });
  });
});
