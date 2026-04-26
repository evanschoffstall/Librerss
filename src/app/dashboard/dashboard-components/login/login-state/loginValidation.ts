/**
 * Describes the login field errors.
 */
export interface LoginFieldErrors {
  confirm?: string;
  email?: string;
  form?: string;
  legal?: string;
  password?: string;
}

/**
 * Describes the login validation input.
 */
interface LoginValidationInput {
  allowSignup: boolean;
  confirmPassword: string;
  email: string;
  hasAcceptedLegalTerms: boolean;
  mode: "login" | "signup";
  password: string;
}

/**
 * Process the validate login fields.
 * @param options - The options used to process the validate login fields.
 * @returns The validate login fields.
 */
export function validateLoginFields(
  options: LoginValidationInput,
): LoginFieldErrors | null {
  const {
    allowSignup,
    confirmPassword,
    email,
    hasAcceptedLegalTerms,
    mode,
    password,
  } = options;
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

/**
 * Process the validate signup fields.
 * @param errors - The errors.
 * @param password - The password.
 * @param confirmPassword - The confirm password.
 * @param hasAcceptedLegalTerms - Whether has accepted legal terms.
 */
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
