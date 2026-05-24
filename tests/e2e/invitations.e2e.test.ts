import { expect, test } from "./test";

const INVITATION_TOKEN = "a".repeat(43);

test.describe("invitation signup links", () => {
  test("open signup while public registration is closed and submit the invite token", async ({
    page,
  }) => {
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          allowSignup: false,
          authenticated: false,
          canManageInvitations: false,
          invitationsEnabled: true,
          usePlaceholderData: false,
          user: null,
        }),
        contentType: "application/json",
        status: 200,
      });
    });
    await page.route("**/api/auth/signup", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          user: { email: "invited@example.com", id: 17 },
        }),
        contentType: "application/json",
        status: 201,
      });
    });

    const sessionResponsePromise = page.waitForResponse("**/api/auth/session");

    await page.goto(`/dashboard?invite=${INVITATION_TOKEN}`, {
      waitUntil: "domcontentloaded",
    });
    await sessionResponsePromise;

    await expect(page.getByText("Create your account")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create account" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Explore without an account" }),
    ).toHaveCount(0);

    const emailInput = page.getByLabel("Email");
    const passwordInput = page.getByLabel("Password", { exact: true });
    const confirmPasswordInput = page.getByLabel("Confirm password", {
      exact: true,
    });
    await emailInput.fill("invited@example.com");
    await passwordInput.fill("ValidPass123!");
    await confirmPasswordInput.fill("ValidPass123!");
    await expect(emailInput).toHaveValue("invited@example.com");
    await expect(passwordInput).toHaveValue("ValidPass123!");
    await expect(confirmPasswordInput).toHaveValue("ValidPass123!");
    const legalConsentCheckbox = page.getByRole("checkbox", {
      name: /I accept the current Privacy Policy and Terms/u,
    });
    await expect
      .poll(async () => {
        await legalConsentCheckbox.click();
        return legalConsentCheckbox.getAttribute("aria-checked");
      })
      .toBe("true");

    const signupRequestPromise = page.waitForRequest("**/api/auth/signup");
    await page.getByRole("button", { name: "Create account" }).click();

    const submittedSignupBody = (
      await signupRequestPromise
    ).postDataJSON() as null | Record<string, unknown>;
    expect(submittedSignupBody).not.toBeNull();
    expect(submittedSignupBody).toMatchObject({
      email: "invited@example.com",
      invitationToken: INVITATION_TOKEN,
      password: "ValidPass123!",
    });
  });
});
