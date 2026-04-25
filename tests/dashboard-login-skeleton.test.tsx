import { render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";

import { LoginViewSkeleton } from "@/app/dashboard/dashboard-components/login";

describe("LoginViewSkeleton", () => {
  test("mirrors the LoginView card layout while loading", () => {
    const { container, getByLabelText } = render(<LoginViewSkeleton />);

    // Accessibility — the skeleton must signal it is busy.
    expect(getByLabelText("Loading login").getAttribute("aria-busy")).toBe(
      "true",
    );

    // Outer card container is present with the login skeleton marker.
    expect(
      container.querySelector('[data-login-skeleton="true"]'),
    ).toBeTruthy();

    // Logo slot skeleton is present.
    expect(
      container.querySelector('[data-login-skeleton-logo="true"]'),
    ).toBeTruthy();

    // Title skeleton is present.
    expect(
      container.querySelector('[data-login-skeleton-title="true"]'),
    ).toBeTruthy();

    // Two description line skeletons approximate the CardDescription text.
    expect(
      container.querySelectorAll('[data-login-skeleton-description="true"]'),
    ).toHaveLength(2);

    // Two form field input skeletons (email + password).
    expect(
      container.querySelectorAll('[data-login-skeleton-input="true"]'),
    ).toHaveLength(2);

    // One primary action button skeleton.
    expect(
      container.querySelector('[data-login-skeleton-button="true"]'),
    ).toBeTruthy();

    // Card must stay within the max-w-md constraint so it matches LoginView.
    expect(container.querySelector(".max-w-md")).toBeTruthy();
  });
});
