import { KeyboardEvent, useState } from "react";
import { toast } from "sonner";

import type { AuthUser } from "@/lib/core";

import {
  type LoginFieldErrors,
  validateLoginFields,
} from "@/app/dashboard/dashboard-components/login/login-state/loginValidation";
import { AuthService } from "@/lib/api";
import { isApiError } from "@/lib/api/http";

interface AuthErrorResponse {
  error?: unknown;
}

interface UseLoginViewStateOptions {
  allowSignup: boolean;
  initialFormError?: string;
  onAuthenticated: (user: AuthUser) => void;
}

export function useLoginViewState({
  allowSignup,
  initialFormError,
  onAuthenticated,
}: UseLoginViewStateOptions) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasAcceptedLegalTerms, setHasAcceptedLegalTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>(() =>
    initialFormError ? { form: initialFormError } : {},
  );

  const clearFieldError = (field: keyof LoginFieldErrors) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const { [field]: _, ...rest } = current;
      return rest;
    });
  };

  const handleSubmit = async () => {
    const errors = validateLoginFields({
      allowSignup,
      confirmPassword,
      email,
      hasAcceptedLegalTerms,
      mode,
      password,
    });

    if (errors) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const user = await submitAuthenticationRequest({ email, mode, password });

      onAuthenticated(user);
      toast.success(mode === "signup" ? "Account created." : "Welcome back.");
    } catch (error: unknown) {
      setFieldErrors({ form: resolveAuthenticationErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) =>
    event.key === "Enter" ? void handleSubmit() : undefined;

  const toggleMode = () => {
    setMode((current) => (current === "login" ? "signup" : "login"));
  };

  return {
    clearFieldError,
    confirmPassword,
    email,
    fieldErrors,
    handleKeyDown,
    handleSubmit,
    hasAcceptedLegalTerms,
    isSubmitting,
    mode,
    password,
    setConfirmPassword,
    setEmail,
    setHasAcceptedLegalTerms,
    setPassword,
    toggleMode,
  };
}

function resolveAuthenticationErrorMessage(error: unknown) {
  return isApiError<AuthErrorResponse>(error) &&
    typeof error.response?.data.error === "string"
    ? error.response.data.error
    : "Authentication failed.";
}

async function submitAuthenticationRequest({
  email,
  mode,
  password,
}: {
  email: string;
  mode: "login" | "signup";
  password: string;
}) {
  return mode === "signup"
    ? AuthService.signup(email.trim(), password)
    : AuthService.login(email.trim(), password);
}
