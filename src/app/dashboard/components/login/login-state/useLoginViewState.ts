import type { KeyboardEvent } from "react";

import { useState } from "react";
import { toast } from "sonner";

import type { AuthUser } from "@/lib/core";

import {
  type LoginFieldErrors,
  validateLoginFields,
} from "@/app/dashboard/components/login/login-state/loginValidation";
import { AuthService } from "@/lib/api";
import { isApiError } from "@/lib/api/http";

/**
 * Describes the auth error response.
 */
interface AuthErrorResponse {
  error?: unknown;
}

/**
 * Describes the options for submit authentication request.
 */
interface SubmitAuthenticationRequestOptions {
  email: string;
  invitationToken?: string;
  mode: "login" | "signup";
  password: string;
}

/**
 * Describes the options for submit login view form.
 */
interface SubmitLoginViewFormOptions extends SubmitAuthenticationRequestOptions {
  allowSignup: boolean;
  confirmPassword: string;
  hasAcceptedLegalTerms: boolean;
  onAuthenticated: (user: AuthUser) => void;
  setFieldErrors: React.Dispatch<React.SetStateAction<LoginFieldErrors>>;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Describes the options for use login view state.
 */
interface UseLoginViewStateOptions {
  allowSignup: boolean;
  initialFormError?: string;
  invitationToken?: string;
  onAuthenticated: (user: AuthUser) => void;
}

/**
 * Manage the login view state.
 * @param options - The options used to manage the login view state.
 * @returns The login view state and callbacks.
 */
export function useLoginViewState(options: UseLoginViewStateOptions) {
  const { allowSignup, initialFormError, invitationToken, onAuthenticated } =
    options;
  const [mode, setMode] = useState<"login" | "signup">(() =>
    invitationToken ? "signup" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasAcceptedLegalTerms, setHasAcceptedLegalTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>(() =>
    initialFormError ? { form: initialFormError } : {},
  );

  /**
   * Process the clear field error.
   * @param field - The field.
   */
  const clearFieldError = (field: keyof LoginFieldErrors) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const { [field]: _, ...rest } = current;
      return rest;
    });
  };

  /**
   * Process the handle submit.
   */
  const handleSubmit = async () => {
    await submitLoginViewForm({
      allowSignup,
      confirmPassword,
      email,
      hasAcceptedLegalTerms,
      invitationToken,
      mode,
      onAuthenticated,
      password,
      setFieldErrors,
      setIsSubmitting,
    });
  };

  /**
   * Process the handle key down.
   * @param event - The event.
   * @returns Nothing.
   */
  const handleKeyDown = (event: KeyboardEvent) =>
    event.key === "Enter" ? void handleSubmit() : undefined;

  /**
   * Process the toggle mode.
   */
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

/**
 * Resolve the authentication error message.
 * @param error - The error.
 * @returns The authentication error message.
 */
function resolveAuthenticationErrorMessage(error: unknown) {
  return isApiError<AuthErrorResponse>(error) &&
    typeof error.response?.data.error === "string"
    ? error.response.data.error
    : "Authentication failed.";
}
/**
 * Process the submit authentication request.
 * @param options - The options used to process the submit authentication request.
 * @returns The submit authentication request.
 */
async function submitAuthenticationRequest(
  options: SubmitAuthenticationRequestOptions,
) {
  const { email, mode, password } = options;
  return mode === "signup"
    ? AuthService.signup(email.trim(), password, options.invitationToken)
    : AuthService.login(email.trim(), password);
}

/**
 * Submit the login form after validating the current field values.
 * @param options - The login form values and state setters used during submission.
 */
async function submitLoginViewForm(
  options: SubmitLoginViewFormOptions,
): Promise<void> {
  const {
    allowSignup,
    confirmPassword,
    email,
    hasAcceptedLegalTerms,
    invitationToken,
    mode,
    onAuthenticated,
    password,
    setFieldErrors,
    setIsSubmitting,
  } = options;
  const errors = validateLoginFields({
    allowSignup,
    confirmPassword,
    email,
    hasAcceptedLegalTerms,
    invitationToken,
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
    const user = await submitAuthenticationRequest({
      email,
      invitationToken,
      mode,
      password,
    });

    onAuthenticated(user);
    toast.success(mode === "signup" ? "Account created." : "Welcome back.");
  } catch (error: unknown) {
    setFieldErrors({ form: resolveAuthenticationErrorMessage(error) });
  } finally {
    setIsSubmitting(false);
  }
}
