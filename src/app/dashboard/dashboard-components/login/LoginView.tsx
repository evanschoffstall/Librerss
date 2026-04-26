"use client";
import { motion } from "motion/react";

import type { AuthUser } from "@/lib/core";

import { useLoginViewState } from "@/app/dashboard/dashboard-components/login/login-state";
import { LoginBackgroundDecoration } from "@/app/dashboard/dashboard-components/login/LoginBackgroundDecoration";
import { LoginCardContent } from "@/app/dashboard/dashboard-components/login/LoginCardContent";
import { LoginCardHeader } from "@/app/dashboard/dashboard-components/login/LoginCardHeader";
import { Card } from "@/components/ui/card";

/**
 * Describes the props for the login view component.
 */
interface LoginViewProps {
  allowSignup: boolean;
  initialFormError?: string;
  onAuthenticated: (user: AuthUser) => void;
  onEnterPreview?: () => void;
}

const LOGIN_CARD_TRANSITION = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1] as const,
};

/**
 * Render the login view component.
 * @param props - The component props.
 * @returns The rendered login view component.
 */
export const LoginView = (props: LoginViewProps) => {
  const { allowSignup, initialFormError, onAuthenticated, onEnterPreview } =
    props;
  const loginViewState = useLoginViewState({
    allowSignup,
    initialFormError,
    onAuthenticated,
  });
  const cardContentProps = buildLoginCardContentProps(
    allowSignup,
    loginViewState,
    onEnterPreview,
  );

  return (
    <div
      className="
        relative flex min-h-[calc(100dvh-3.5rem)] items-center justify-center
        px-4 pt-14
      "
    >
      <LoginBackgroundDecoration />
      <motion.div
        animate={{ opacity: 1, scale: 1, y: 0 }}
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        transition={LOGIN_CARD_TRANSITION}
      >
        <Card className="relative w-full max-w-md">
          <LoginCardHeader mode={loginViewState.mode} />
          <LoginCardContent {...cardContentProps} />
        </Card>
      </motion.div>
    </div>
  );
};

/**
 * Build the props passed to the login card content component.
 * @param allowSignup - Whether signup should be enabled.
 * @param loginViewState - The current login view state and callbacks.
 * @param onEnterPreview - Optional preview-entry callback.
 * @returns The login card content props.
 */
function buildLoginCardContentProps(
  allowSignup: boolean,
  loginViewState: ReturnType<typeof useLoginViewState>,
  onEnterPreview: LoginViewProps["onEnterPreview"],
) {
  return {
    allowSignup,
    confirmPassword: loginViewState.confirmPassword,
    email: loginViewState.email,
    fieldErrors: loginViewState.fieldErrors,
    hasAcceptedLegalTerms: loginViewState.hasAcceptedLegalTerms,
    isSubmitting: loginViewState.isSubmitting,
    mode: loginViewState.mode,
    /**
     * Sync the confirm-password field and clear its validation error.
     * @param value - The next confirm-password field value.
     */
    onChangeConfirmPassword: (value: string) => {
      loginViewState.setConfirmPassword(value);
      loginViewState.clearFieldError("confirm");
    },
    /**
     * Sync the email field and clear its validation error.
     * @param value - The next email field value.
     */
    onChangeEmail: (value: string) => {
      loginViewState.setEmail(value);
      loginViewState.clearFieldError("email");
    },
    /**
     * Sync the legal-terms checkbox and clear its validation error once accepted.
     * @param checked - Whether the legal-terms checkbox is checked.
     */
    onChangeLegalTerms: (checked: boolean) => {
      loginViewState.setHasAcceptedLegalTerms(checked);
      if (checked) {
        loginViewState.clearFieldError("legal");
      }
    },
    /**
     * Sync the password field and clear its validation error.
     * @param value - The next password field value.
     */
    onChangePassword: (value: string) => {
      loginViewState.setPassword(value);
      loginViewState.clearFieldError("password");
    },
    onEnterPreview,
    onKeyDown: loginViewState.handleKeyDown,
    /**
     * Submit the current login form state.
     */
    onSubmit: () => {
      void loginViewState.handleSubmit();
    },
    onToggleMode: loginViewState.toggleMode,
    password: loginViewState.password,
  };
}
