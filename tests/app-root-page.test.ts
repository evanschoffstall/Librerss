import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let pageImportVersion = 0;

async function loadHomePage() {
  pageImportVersion += 1;
  return import(`@/app/page?test-version=${pageImportVersion}`);
}

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("app root page", () => {
  test("redirects to the dashboard when dev auto-login is enabled", async () => {
    const redirect = mock(() => undefined);

    mock.module("next/navigation", () => ({ redirect }));
    mock.module("@/lib/auth/dev-auto-login", () => ({
      isDevAutoLoginEnabled: () => true,
    }));

    const { default: Home } = await loadHomePage();
    Home();

    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  test("redirects to landing when dev auto-login is disabled", async () => {
    const redirect = mock(() => undefined);

    mock.module("next/navigation", () => ({ redirect }));
    mock.module("@/lib/auth/dev-auto-login", () => ({
      isDevAutoLoginEnabled: () => false,
    }));

    const { default: Home } = await loadHomePage();
    Home();

    expect(redirect).toHaveBeenCalledWith("/landing");
  });
});
