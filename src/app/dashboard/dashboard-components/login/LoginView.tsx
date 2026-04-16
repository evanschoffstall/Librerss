"use client";
import { motion } from "motion/react";

import type { AuthUser } from "@/lib/core";

import { useLoginViewState } from "@/app/dashboard/dashboard-components/login/login-state";
import { LoginBackgroundDecoration } from "@/app/dashboard/dashboard-components/login/LoginBackgroundDecoration";
import { LoginCardContent } from "@/app/dashboard/dashboard-components/login/LoginCardContent";
import { LoginCardHeader } from "@/app/dashboard/dashboard-components/login/LoginCardHeader";
import { Card } from "@/components/ui/card";

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

export const LoginView = ({
  allowSignup,
  initialFormError,
  onAuthenticated,
  onEnterPreview,
}: LoginViewProps) => {
  const loginViewState = useLoginViewState({
    allowSignup,
    initialFormError,
    onAuthenticated,
  });

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
          <LoginCardContent
            allowSignup={allowSignup}
            confirmPassword={loginViewState.confirmPassword}
            email={loginViewState.email}
            fieldErrors={loginViewState.fieldErrors}
            hasAcceptedLegalTerms={loginViewState.hasAcceptedLegalTerms}
            isSubmitting={loginViewState.isSubmitting}
            mode={loginViewState.mode}
            onChangeConfirmPassword={(value) => {
              loginViewState.setConfirmPassword(value);
              loginViewState.clearFieldError("confirm");
            }}
            onChangeEmail={(value) => {
              loginViewState.setEmail(value);
              loginViewState.clearFieldError("email");
            }}
            onChangeLegalTerms={(checked) => {
              loginViewState.setHasAcceptedLegalTerms(checked);
              if (checked) {
                loginViewState.clearFieldError("legal");
              }
            }}
            onChangePassword={(value) => {
              loginViewState.setPassword(value);
              loginViewState.clearFieldError("password");
            }}
            onEnterPreview={onEnterPreview}
            onKeyDown={loginViewState.handleKeyDown}
            onSubmit={() => {
              void loginViewState.handleSubmit();
            }}
            onToggleMode={loginViewState.toggleMode}
            password={loginViewState.password}
          />
        </Card>
      </motion.div>
    </div>
  );
};
