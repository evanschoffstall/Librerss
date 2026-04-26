import type { KeyboardEventHandler } from "react";

import { type LoginFieldErrors } from "@/app/dashboard/dashboard-components/login/login-state";
import { LoginFooterLinks } from "@/app/dashboard/dashboard-components/login/LoginFooterLinks";
import { LoginInputField } from "@/app/dashboard/dashboard-components/login/LoginInputField";
import { LoginLegalConsent } from "@/app/dashboard/dashboard-components/login/LoginLegalConsent";
import { LoginPrimaryActions } from "@/app/dashboard/dashboard-components/login/LoginPrimaryActions";
import { CardContent } from "@/components/ui/card";

/**
 * Describes the props for the login card content component.
 */
interface LoginCardContentProps {
  allowSignup: boolean;
  confirmPassword: string;
  email: string;
  fieldErrors: LoginFieldErrors;
  hasAcceptedLegalTerms: boolean;
  isSubmitting: boolean;
  mode: "login" | "signup";
  onChangeConfirmPassword: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onChangeLegalTerms: (checked: boolean) => void;
  onChangePassword: (value: string) => void;
  onEnterPreview?: () => void;
  onKeyDown: KeyboardEventHandler;
  onSubmit: () => void;
  onToggleMode: () => void;
  password: string;
}

/**
 * Describes the props for the login form error component.
 */
interface LoginFormErrorProps {
  message?: string;
}
/**
 * Describes the props for the signup fields component.
 */
interface SignupFieldsProps {
  confirmError?: string;
  confirmPassword: string;
  hasAcceptedLegalTerms: boolean;
  legalError?: string;
  onAcceptedChange: (checked: boolean) => void;
  onChangeConfirmPassword: (value: string) => void;
  onKeyDown: KeyboardEventHandler;
}

/**
 * Render the login card content component.
 * @param props - The component props.
 * @returns The rendered login card content component.
 */
export function LoginCardContent(props: LoginCardContentProps) {
  const {
    allowSignup,
    confirmPassword,
    email,
    fieldErrors,
    hasAcceptedLegalTerms,
    isSubmitting,
    mode,
    onChangeConfirmPassword,
    onChangeEmail,
    onChangeLegalTerms,
    onChangePassword,
    onEnterPreview,
    onKeyDown,
    onSubmit,
    onToggleMode,
    password,
  } = props;
  return (
    <CardContent className="space-y-4">
      <LoginFormError message={fieldErrors.form} />
      <LoginInputField
        error={fieldErrors.email}
        fieldId="auth-email"
        label="Email"
        onChange={onChangeEmail}
        onKeyDown={onKeyDown}
        placeholder="you@example.com"
        type="email"
        value={email}
      />
      <LoginInputField
        error={fieldErrors.password}
        fieldId="auth-password"
        label="Password"
        onChange={onChangePassword}
        onKeyDown={onKeyDown}
        placeholder="••••••••"
        type="password"
        value={password}
      />
      {mode === "signup" ? (
        <SignupFields
          confirmError={fieldErrors.confirm}
          confirmPassword={confirmPassword}
          hasAcceptedLegalTerms={hasAcceptedLegalTerms}
          legalError={fieldErrors.legal}
          onAcceptedChange={onChangeLegalTerms}
          onChangeConfirmPassword={onChangeConfirmPassword}
          onKeyDown={onKeyDown}
        />
      ) : null}
      <LoginPrimaryActions
        allowSignup={allowSignup}
        isSubmitting={isSubmitting}
        mode={mode}
        onEnterPreview={onEnterPreview}
        onSubmit={onSubmit}
        onToggleMode={onToggleMode}
      />
      <LoginFooterLinks />
    </CardContent>
  );
}
/**
 * Render the login form error component.
 * @param props - The component props.
 * @returns The rendered login form error component.
 */
function LoginFormError(props: LoginFormErrorProps) {
  const { message } = props;
  if (!message) {
    return null;
  }

  return (
    <div
      className="
        rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2
        text-xs text-destructive
      "
      role="alert"
    >
      {message}
    </div>
  );
}

/**
 * Render the signup fields component.
 * @param props - The component props.
 * @returns The rendered signup fields component.
 */
function SignupFields(props: SignupFieldsProps) {
  const {
    confirmError,
    confirmPassword,
    hasAcceptedLegalTerms,
    legalError,
    onAcceptedChange,
    onChangeConfirmPassword,
    onKeyDown,
  } = props;
  return (
    <>
      <LoginInputField
        error={confirmError}
        fieldId="auth-confirm"
        label="Confirm password"
        onChange={onChangeConfirmPassword}
        onKeyDown={onKeyDown}
        placeholder="••••••••"
        type="password"
        value={confirmPassword}
      />
      <LoginLegalConsent
        errorMessage={legalError}
        hasAcceptedLegalTerms={hasAcceptedLegalTerms}
        onAcceptedChange={onAcceptedChange}
      />
    </>
  );
}
