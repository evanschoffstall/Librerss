import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realMotionReactModule from "motion/react";
import React from "react";

const mockMotion = new Proxy(realMotionReactModule.motion, {
  get:
    (_target, tag) =>
    ({ children }: { children: React.ReactNode }) =>
      React.createElement(tag as string, undefined, children),
});

async function loadLoginComponents() {
  const [
    cardContentModule,
    cardHeaderModule,
    fieldErrorModule,
    footerLinksModule,
    inputFieldModule,
    legalConsentModule,
    primaryActionsModule,
  ] = await Promise.all([
    import(
      `@/app/dashboard/components/login/LoginCardContent?test=${Date.now()}-${Math.random()}`
    ),
    import(
      `@/app/dashboard/components/login/LoginCardHeader?test=${Date.now()}-${Math.random()}`
    ),
    import(
      `@/app/dashboard/components/login/LoginFieldError?test=${Date.now()}-${Math.random()}`
    ),
    import(
      `@/app/dashboard/components/login/LoginFooterLinks?test=${Date.now()}-${Math.random()}`
    ),
    import(
      `@/app/dashboard/components/login/LoginInputField?test=${Date.now()}-${Math.random()}`
    ),
    import(
      `@/app/dashboard/components/login/LoginLegalConsent?test=${Date.now()}-${Math.random()}`
    ),
    import(
      `@/app/dashboard/components/login/LoginPrimaryActions?test=${Date.now()}-${Math.random()}`
    ),
  ]);

  return {
    LoginCardContent: cardContentModule.LoginCardContent,
    LoginCardHeader: cardHeaderModule.LoginCardHeader,
    LoginFieldError: fieldErrorModule.LoginFieldError,
    LoginFooterLinks: footerLinksModule.LoginFooterLinks,
    LoginInputField: inputFieldModule.LoginInputField,
    LoginLegalConsent: legalConsentModule.LoginLegalConsent,
    LoginPrimaryActions: primaryActionsModule.LoginPrimaryActions,
  };
}

describe("login components", () => {
  beforeEach(() => {
    mock.restore();
    mock.module("motion/react", () => ({
      ...realMotionReactModule,
      motion: mockMotion,
    }));
  });

  afterEach(() => {
    cleanup();
    mock.restore();
  });

  test("renders field and footer primitives", async () => {
    const {
      LoginFieldError,
      LoginFooterLinks,
      LoginInputField,
      LoginLegalConsent,
    } = await loadLoginComponents();
    const inputChange = mock();
    const inputKeyDown = mock();
    const consentChange = mock();
    const input = render(
      <LoginInputField
        error="Email is required."
        fieldId="email"
        label="Email"
        onChange={inputChange}
        onKeyDown={inputKeyDown}
        placeholder="you@example.com"
        type="email"
        value=""
      />,
    );

    expect(input.getByText("Email is required.")).toBeTruthy();

    const consent = render(
      <LoginLegalConsent
        errorMessage="Accept the privacy policy and terms before creating an account."
        hasAcceptedLegalTerms={false}
        onAcceptedChange={consentChange}
      />,
    );
    fireEvent.click(consent.getByRole("checkbox"));
    expect(consentChange).toHaveBeenCalledWith(true);
    expect(
      consent.getByText(
        "Accept the privacy policy and terms before creating an account.",
      ),
    ).toBeTruthy();

    const footer = render(<LoginFooterLinks />);
    expect(
      footer.getByRole("link", { name: "Privacy Policy" }).getAttribute("href"),
    ).toBe("/privacy");
    expect(
      footer.getByRole("link", { name: "Terms" }).getAttribute("href"),
    ).toBe("/terms");
    expect(
      render(<LoginFieldError message={undefined} />).container.textContent,
    ).toBe("");
    expect(
      render(<LoginFieldError message="Problem" />).getByText("Problem"),
    ).toBeTruthy();
  });

  test("renders action and header variants for login and signup", async () => {
    const { LoginCardHeader, LoginPrimaryActions } =
      await loadLoginComponents();
    const onEnterPreview = mock();
    const onSubmit = mock();
    const onToggleMode = mock();

    const header = render(<LoginCardHeader mode="login" />);
    expect(header.getByText("Sign in to LibreRSS")).toBeTruthy();
    header.rerender(<LoginCardHeader mode="signup" />);
    expect(header.getByText("Create your account")).toBeTruthy();

    const actions = render(
      <LoginPrimaryActions
        allowSignup
        isSubmitting={false}
        mode="login"
        onEnterPreview={onEnterPreview}
        onSubmit={onSubmit}
        onToggleMode={onToggleMode}
      />,
    );
    fireEvent.click(actions.getByRole("button", { name: "Continue" }));
    fireEvent.click(
      actions.getByRole("button", { name: "Need an account? Sign up" }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onToggleMode).toHaveBeenCalledTimes(1);

    actions.rerender(
      <LoginPrimaryActions
        allowSignup={false}
        isSubmitting={true}
        mode="signup"
        onEnterPreview={onEnterPreview}
        onSubmit={onSubmit}
        onToggleMode={onToggleMode}
      />,
    );
    expect(
      (
        actions.getByRole("button", {
          name: "Create account",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        actions.getByRole("button", {
          name: "Explore without an account",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("renders signup card content and wires callbacks", async () => {
    const { LoginCardContent } = await loadLoginComponents();
    const onChangeConfirmPassword = mock();
    const onChangeEmail = mock();
    const onChangeLegalTerms = mock();
    const onChangePassword = mock();
    const onEnterPreview = mock();
    const onKeyDown = mock();
    const onSubmit = mock();
    const onToggleMode = mock();

    const view = render(
      <LoginCardContent
        allowSignup={false}
        confirmPassword=""
        email=""
        fieldErrors={{
          confirm: "Confirm your password.",
          email: "Email is required.",
          form: "Session expired.",
          legal:
            "Accept the privacy policy and terms before creating an account.",
          password: "Password is required.",
        }}
        hasAcceptedLegalTerms={false}
        isSubmitting={false}
        mode="signup"
        onChangeConfirmPassword={onChangeConfirmPassword}
        onChangeEmail={onChangeEmail}
        onChangeLegalTerms={onChangeLegalTerms}
        onChangePassword={onChangePassword}
        onEnterPreview={onEnterPreview}
        onKeyDown={onKeyDown}
        onSubmit={onSubmit}
        onToggleMode={onToggleMode}
        password=""
      />,
    );

    expect(view.getByText("Session expired.")).toBeTruthy();
    expect(view.getByText("Confirm your password.")).toBeTruthy();
    fireEvent.click(view.getByRole("checkbox"));
    fireEvent.click(view.getByRole("button", { name: "Create account" }));
    fireEvent.click(
      view.getByRole("button", { name: "Explore without an account" }),
    );

    expect(onChangeLegalTerms).toHaveBeenCalledWith(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onEnterPreview).toHaveBeenCalledTimes(1);
  });
});
