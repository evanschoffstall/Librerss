import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realMotionReactModule from "motion/react";
import React from "react";
import * as realSonnerModule from "sonner";

const loginMock = mock();
const signupMock = mock();
const toastSuccessMock = mock();
const clearFieldErrorMock = mock();
const handleSubmitMock = mock(async () => {});
const setConfirmPasswordMock = mock();
const setEmailMock = mock();
const setHasAcceptedLegalTermsMock = mock();
const setPasswordMock = mock();
const toggleModeMock = mock();
const useLoginViewStateMock = mock();
const triggerConfirmChangeMock = mock();
const triggerEmailChangeMock = mock();
const triggerLegalChangeMock = mock();
const triggerPasswordMock = mock();
const triggerPreviewMock = mock();
const triggerSubmitMock = mock();
const triggerToggleMock = mock();

let ApiErrorCtor: typeof import("@/lib/api/http/client").ApiError;
let authService: {
  getSession: typeof import("@/lib/api/auth-service").AuthService.getSession;
  login: typeof import("@/lib/api/auth-service").AuthService.login;
  logout: typeof import("@/lib/api/auth-service").AuthService.logout;
  signup: typeof import("@/lib/api/auth-service").AuthService.signup;
};
let originalGetSession: typeof authService.getSession;
let originalLogin: typeof authService.login;
let originalLogout: typeof authService.logout;
let originalSignup: typeof authService.signup;

const mockMotion = new Proxy(realMotionReactModule.motion, {
  get:
    (_target, tag) =>
    ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => {
      const {
        animate: _animate,
        initial: _initial,
        transition: _transition,
        ...rest
      } = props as React.HTMLAttributes<HTMLElement> & {
        animate?: unknown;
        initial?: unknown;
        transition?: unknown;
      };

      return React.createElement(tag as string, rest, children);
    },
});

function loadLoginValidationModule() {
  return import(
    `@/app/dashboard/dashboard-components/login/login-state?test=${Date.now()}-${Math.random()}`
  );
}

function loadUseLoginViewStateModule() {
  mock.module("sonner", () => ({
    ...realSonnerModule,
    toast: {
      ...realSonnerModule.toast,
      success: toastSuccessMock,
    },
  }));

  return import(
    `@/app/dashboard/dashboard-components/login/login-state/useLoginViewState?test=${Date.now()}-${Math.random()}`
  );
}

function setupLoginViewModule() {
  mock.module("motion/react", () => ({
    ...realMotionReactModule,
    motion: mockMotion,
  }));
  mock.module("@/app/dashboard/dashboard-components/login/login-state", () => ({
    useLoginViewState: useLoginViewStateMock,
  }));
  mock.module(
    "@/app/dashboard/dashboard-components/login/LoginCardContent",
    () => ({
      LoginCardContent: (props: {
        fieldErrors: { form?: string };
        onChangeConfirmPassword: (value: string) => void;
        onChangeEmail: (value: string) => void;
        onChangeLegalTerms: (checked: boolean) => void;
        onChangePassword: (value: string) => void;
        onEnterPreview?: () => void;
        onSubmit: () => void;
        onToggleMode: () => void;
      }) => (
        <div>
          <p>{props.fieldErrors.form}</p>
          <button
            onClick={() => {
              triggerEmailChangeMock();
              props.onChangeEmail("person@example.com");
            }}
            type="button"
          >
            trigger-email
          </button>
          <button
            onClick={() => {
              triggerPasswordMock();
              props.onChangePassword("password123");
            }}
            type="button"
          >
            trigger-password
          </button>
          <button
            onClick={() => {
              triggerConfirmChangeMock();
              props.onChangeConfirmPassword("password123");
            }}
            type="button"
          >
            trigger-confirm
          </button>
          <button
            onClick={() => {
              triggerLegalChangeMock();
              props.onChangeLegalTerms(true);
            }}
            type="button"
          >
            trigger-legal
          </button>
          <button
            onClick={() => {
              triggerSubmitMock();
              props.onSubmit();
            }}
            type="button"
          >
            trigger-submit
          </button>
          <button
            onClick={() => {
              triggerToggleMock();
              props.onToggleMode();
            }}
            type="button"
          >
            trigger-toggle
          </button>
          {props.onEnterPreview ? (
            <button
              onClick={() => {
                triggerPreviewMock();
                props.onEnterPreview?.();
              }}
              type="button"
            >
              trigger-preview
            </button>
          ) : null}
        </div>
      ),
    }),
  );

  return import(
    `@/app/dashboard/dashboard-components/login/LoginView?test=${Date.now()}-${Math.random()}`
  );
}

describe("login state", () => {
  beforeEach(async () => {
    mock.restore();
    ({ ApiError: ApiErrorCtor } = await import("@/lib/api/http/client"));
    ({ AuthService: authService } = await import("@/lib/api/auth-service"));
    originalGetSession = authService.getSession;
    originalLogin = authService.login;
    originalLogout = authService.logout;
    originalSignup = authService.signup;
    loginMock.mockReset();
    signupMock.mockReset();
    toastSuccessMock.mockReset();
    clearFieldErrorMock.mockReset();
    handleSubmitMock.mockReset();
    setConfirmPasswordMock.mockReset();
    setEmailMock.mockReset();
    setHasAcceptedLegalTermsMock.mockReset();
    setPasswordMock.mockReset();
    toggleModeMock.mockReset();
    useLoginViewStateMock.mockReset();
    triggerConfirmChangeMock.mockReset();
    triggerEmailChangeMock.mockReset();
    triggerLegalChangeMock.mockReset();
    triggerPasswordMock.mockReset();
    triggerPreviewMock.mockReset();
    triggerSubmitMock.mockReset();
    triggerToggleMock.mockReset();
    authService.getSession = originalGetSession;
    authService.login = loginMock;
    authService.logout = originalLogout;
    authService.signup = signupMock;
  });

  afterEach(() => {
    cleanup();
    mock.restore();
    authService.getSession = originalGetSession;
    authService.login = originalLogin;
    authService.logout = originalLogout;
    authService.signup = originalSignup;
  });

  test("returns the expected login and signup validation errors", async () => {
    const { validateLoginFields } = await loadLoginValidationModule();

    expect(
      validateLoginFields({
        allowSignup: false,
        confirmPassword: "",
        email: "person@example.com",
        hasAcceptedLegalTerms: false,
        mode: "signup",
        password: "password123",
      }),
    ).toEqual({ form: "Signup is disabled by server configuration." });

    expect(
      validateLoginFields({
        allowSignup: false,
        confirmPassword: "password123",
        email: "person@example.com",
        hasAcceptedLegalTerms: true,
        invitationToken: "a".repeat(43),
        mode: "signup",
        password: "password123",
      }),
    ).toBeNull();

    expect(
      validateLoginFields({
        allowSignup: true,
        confirmPassword: "",
        email: "   ",
        hasAcceptedLegalTerms: false,
        mode: "signup",
        password: "short",
      }),
    ).toEqual({
      confirm: "Confirm your password.",
      email: "Email is required.",
      legal: "Accept the privacy policy and terms before creating an account.",
      password: "Password must be at least 8 characters.",
    });

    expect(
      validateLoginFields({
        allowSignup: true,
        confirmPassword: "password124",
        email: "person@example.com",
        hasAcceptedLegalTerms: true,
        mode: "signup",
        password: "password123",
      }),
    ).toEqual({ confirm: "Passwords do not match." });

    expect(
      validateLoginFields({
        allowSignup: true,
        confirmPassword: "",
        email: "person@example.com",
        hasAcceptedLegalTerms: true,
        mode: "login",
        password: "password123",
      }),
    ).toBeNull();
  });

  test("renders LoginView and wires card-content callbacks", async () => {
    const onAuthenticated = mock();
    const onEnterPreview = mock();
    useLoginViewStateMock.mockReturnValue({
      clearFieldError: clearFieldErrorMock,
      confirmPassword: "confirm-value",
      email: "user@example.com",
      fieldErrors: { form: "Session expired." },
      handleKeyDown: mock(),
      handleSubmit: handleSubmitMock,
      hasAcceptedLegalTerms: false,
      isSubmitting: false,
      mode: "login",
      password: "password-value",
      setConfirmPassword: setConfirmPasswordMock,
      setEmail: setEmailMock,
      setHasAcceptedLegalTerms: setHasAcceptedLegalTermsMock,
      setPassword: setPasswordMock,
      toggleMode: toggleModeMock,
    });
    const { LoginView } = await setupLoginViewModule();

    const view = render(
      <LoginView
        allowSignup={false}
        initialFormError="Session expired."
        onAuthenticated={onAuthenticated}
        onEnterPreview={onEnterPreview}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "trigger-email" }));
    fireEvent.click(view.getByRole("button", { name: "trigger-password" }));
    fireEvent.click(view.getByRole("button", { name: "trigger-confirm" }));
    fireEvent.click(view.getByRole("button", { name: "trigger-legal" }));
    fireEvent.click(view.getByRole("button", { name: "trigger-submit" }));
    fireEvent.click(view.getByRole("button", { name: "trigger-toggle" }));
    fireEvent.click(view.getByRole("button", { name: "trigger-preview" }));

    expect(setEmailMock).toHaveBeenCalledWith("person@example.com");
    expect(setPasswordMock).toHaveBeenCalledWith("password123");
    expect(setConfirmPasswordMock).toHaveBeenCalledWith("password123");
    expect(setHasAcceptedLegalTermsMock).toHaveBeenCalledWith(true);
    expect(clearFieldErrorMock).toHaveBeenCalledWith("email");
    expect(clearFieldErrorMock).toHaveBeenCalledWith("password");
    expect(clearFieldErrorMock).toHaveBeenCalledWith("confirm");
    expect(clearFieldErrorMock).toHaveBeenCalledWith("legal");
    expect(handleSubmitMock).toHaveBeenCalledTimes(1);
    expect(toggleModeMock).toHaveBeenCalledTimes(1);
    expect(onEnterPreview).toHaveBeenCalledTimes(1);
  });

  test("submits the hook state for login and signup flows", async () => {
    const onAuthenticated = mock();
    const user = { email: "person@example.com", id: "user-1" };
    loginMock
      .mockRejectedValueOnce(
        new ApiErrorCtor(
          "Bad credentials.",
          null,
          "POST",
          {},
          {
            data: { error: "Bad credentials." },
            headers: {},
            status: 401,
            statusText: "Unauthorized",
          },
          "/api/auth/login",
        ),
      )
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(user);
    signupMock.mockResolvedValue(user);
    const { useLoginViewState } = await loadUseLoginViewStateModule();

    const { result } = renderHook(() =>
      useLoginViewState({
        allowSignup: true,
        initialFormError: "Session expired.",
        onAuthenticated,
      }),
    );

    expect(result.current.fieldErrors.form).toBe("Session expired.");
    act(() => {
      result.current.setEmail("person@example.com");
      result.current.setPassword("password123");
    });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.fieldErrors.form).toBe("Bad credentials.");

    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.fieldErrors.form).toBe("Authentication failed.");

    await act(async () => {
      result.current.handleKeyDown({ key: "Escape" } as React.KeyboardEvent);
      await result.current.handleSubmit();
    });
    expect(loginMock).toHaveBeenCalledWith("person@example.com", "password123");
    expect(onAuthenticated).toHaveBeenCalledWith(user);
    expect(toastSuccessMock).toHaveBeenCalledWith("Welcome back.");

    act(() => {
      result.current.toggleMode();
      result.current.setPassword("password123");
      result.current.setConfirmPassword("password123");
      result.current.setHasAcceptedLegalTerms(true);
    });
    await act(async () => {
      await result.current.handleKeyDown({
        key: "Enter",
      } as React.KeyboardEvent);
    });

    await waitFor(() => {
      expect(signupMock).toHaveBeenCalledWith(
        "person@example.com",
        "password123",
        undefined,
      );
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Account created.");
  });

  test("starts invitation links in signup mode and submits the token", async () => {
    const onAuthenticated = mock();
    const user = { email: "person@example.com", id: "user-1" };
    signupMock.mockResolvedValue(user);
    const { useLoginViewState } = await loadUseLoginViewStateModule();

    const { result } = renderHook(() =>
      useLoginViewState({
        allowSignup: false,
        invitationToken: "a".repeat(43),
        onAuthenticated,
      }),
    );

    expect(result.current.mode).toBe("signup");
    act(() => {
      result.current.setEmail("person@example.com");
      result.current.setPassword("password123");
      result.current.setConfirmPassword("password123");
      result.current.setHasAcceptedLegalTerms(true);
    });
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(signupMock).toHaveBeenCalledWith(
      "person@example.com",
      "password123",
      "a".repeat(43),
    );
    expect(onAuthenticated).toHaveBeenCalledWith(user);
  });
});
