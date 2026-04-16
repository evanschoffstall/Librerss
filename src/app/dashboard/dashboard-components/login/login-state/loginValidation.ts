export interface LoginFieldErrors {
  confirm?: string;
  email?: string;
  form?: string;
  legal?: string;
  password?: string;
}

interface LoginValidationInput {
  allowSignup: boolean;
  confirmPassword: string;
  email: string;
  hasAcceptedLegalTerms: boolean;
  mode: "login" | "signup";
  password: string;
}

/** Validates the login or signup form and returns field-scoped errors when invalid. */
export function validateLoginFields({
  allowSignup,
  confirmPassword,
  email,
  hasAcceptedLegalTerms,
  mode,
  password,
}: LoginValidationInput): LoginFieldErrors | null {
  const errors: LoginFieldErrors = {};

  if (mode === "signup" && !allowSignup) {
    errors.form = "Signup is disabled by server configuration.";
    return errors;
  }

  if (!email.trim()) {
    errors.email = "Email is required.";
  }

  if (!password) {
    errors.password = "Password is required.";
  }

  if (mode === "signup") {
    validateSignupFields(
      errors,
      password,
      confirmPassword,
      hasAcceptedLegalTerms,
    );
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

function validateSignupFields(
  errors: LoginFieldErrors,
  password: string,
  confirmPassword: string,
  hasAcceptedLegalTerms: boolean,
): void {
  if (password && password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  if (!hasAcceptedLegalTerms) {
    errors.legal =
      "Accept the privacy policy and terms before creating an account.";
  }

  if (!password) {
    return;
  }

  if (!confirmPassword) {
    errors.confirm = "Confirm your password.";
    return;
  }

  if (password !== confirmPassword) {
    errors.confirm = "Passwords do not match.";
  }
}
