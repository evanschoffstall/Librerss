import { render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { AlertTriangle, FileQuestion } from "lucide-react";

import { StatusPage } from "@/app/components/StatusPage";
import { Button } from "@/components/ui/button";

describe("StatusPage", () => {
  test("renders the shared shell for link-style actions", () => {
    const { container, getByRole, getByText } = render(
      <StatusPage
        action={<a href="/landing">Back to home</a>}
        code="404"
        eyebrow="Page not found"
        icon={FileQuestion}
        message="The page you are looking for does not exist."
      />,
    );

    expect(container.querySelector('[data-status-page="404"]')).toBeTruthy();
    expect(getByText("Page not found")).toBeTruthy();
    expect(getByRole("heading", { name: "404" })).toBeTruthy();
    expect(
      container.querySelector('[data-status-page-icon="404"] svg'),
    ).toBeTruthy();
    expect(getByRole("link", { name: "Back to home" })).toBeTruthy();
  });

  test("renders the shared shell for button-style actions", () => {
    const { container, getByRole, getByText } = render(
      <StatusPage
        action={<Button type="button">Try again</Button>}
        code="500"
        eyebrow="Something went wrong"
        icon={AlertTriangle}
        iconClassName="size-7 text-destructive"
        message="An unexpected error occurred."
      />,
    );

    expect(container.querySelector('[data-status-page="500"]')).toBeTruthy();
    expect(getByText("Something went wrong")).toBeTruthy();
    expect(getByRole("heading", { name: "500" })).toBeTruthy();
    expect(getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(
      container
        .querySelector('[data-status-page-icon="500"] svg')
        ?.getAttribute("class"),
    ).toContain("text-destructive");
  });
});