import { render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

import Landing from "@/app/landing/page";

afterEach(() => {
  globalThis.localStorage?.clear();
});

describe("landing page", () => {
  test("renders the public marketing surface and footer links", () => {
    globalThis.localStorage = window.localStorage;
    globalThis.localStorage.setItem("theme-notice-dismissed", "true");

    const view = render(<Landing />);

    expect(view.getByText("Your reading,")).toBeTruthy();
    expect(view.getByText("without the noise.")).toBeTruthy();
    expect(
      view.getByText(/A free, open-source feed hub for RSS\./u),
    ).toBeTruthy();

    expect(
      view.getByRole("link", { name: /Open Dashboard/u }).getAttribute("href"),
    ).toBe("/dashboard");

    expect(view.getByText("Cloud Synced")).toBeTruthy();
    expect(view.getByText("Instant & Free")).toBeTruthy();
    expect(view.getByText("Any RSS Feed")).toBeTruthy();

    expect(
      view.getByRole("link", { name: "Privacy Policy" }).getAttribute("href"),
    ).toBe("/privacy");
    expect(view.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe(
      "/terms",
    );
    expect(
      view.getByText(/Open-source · Self-hostable · Feed-first/u),
    ).toBeTruthy();
  });
});
