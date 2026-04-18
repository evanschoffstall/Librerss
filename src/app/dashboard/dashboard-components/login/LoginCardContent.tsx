import type { KeyboardEventHandler } from "react";

import { type LoginFieldErrors } from "@/app/dashboard/dashboard-components/login/login-state";
import { LoginFooterLinks } from "@/app/dashboard/dashboard-components/login/LoginFooterLinks";
import { LoginInputField } from "@/app/dashboard/dashboard-components/login/LoginInputField";
import { LoginLegalConsent } from "@/app/dashboard/dashboard-components/login/LoginLegalConsent";
import { LoginPrimaryActions } from "@/app/dashboard/dashboard-components/login/LoginPrimaryActions";
import { CardContent } from "@/components/ui/card";

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
 * @param root0
 * @param root0.allowSignup
 * @param root0.confirmPassword
 * @param root0.email
 * @param root0.fieldErrors
 * @param root0.hasAcceptedLegalTerms
 * @param root0.isSubmitting
 * @param root0.mode
 * @param root0.onChangeConfirmPassword
 * @param root0.onChangeEmail
 * @param root0.onChangeLegalTerms
 * @param root0.onChangePassword
 * @param root0.onEnterPreview
 * @param root0.onKeyDown
 * @param root0.onSubmit
 * @param root0.onToggleMode
 * @param root0.password
 */
export function LoginCardContent({
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
}: LoginCardContentProps) {
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
 * @param root0
 * @param root0.message
 */
function LoginFormError({ message }: { message?: string }) {
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
 * @param root0
 * @param root0.confirmError
 * @param root0.confirmPassword
 * @param root0.hasAcceptedLegalTerms
 * @param root0.legalError
 * @param root0.onAcceptedChange
 * @param root0.onChangeConfirmPassword
 * @param root0.onKeyDown
 */
function SignupFields({
  confirmError,
  confirmPassword,
  hasAcceptedLegalTerms,
  legalError,
  onAcceptedChange,
  onChangeConfirmPassword,
  onKeyDown,
}: {
  confirmError?: string;
  confirmPassword: string;
  hasAcceptedLegalTerms: boolean;
  legalError?: string;
  onAcceptedChange: (checked: boolean) => void;
  onChangeConfirmPassword: (value: string) => void;
  onKeyDown: KeyboardEventHandler;
}) {
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
