"use client";
import { Loader2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { KeyboardEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthService, type AuthUser } from "@/lib";
import { isApiError } from "@/lib/api/http";

interface AuthErrorResponse {
  error?: unknown;
}

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

interface LoginFieldErrors {
  confirm?: string;
  email?: string;
  form?: string;
  legal?: string;
  password?: string;
}

/** Inline validation error shown beneath the relevant form field group. */
function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

function validateLoginFields(
  mode: "login" | "signup",
  allowSignup: boolean,
  email: string,
  password: string,
  confirmPassword: string,
  hasAcceptedLegalTerms: boolean,
): LoginFieldErrors | null {
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
    if (password && password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }
    if (!hasAcceptedLegalTerms) {
      errors.legal =
        "Accept the privacy policy and terms before creating an account.";
    }
    if (password && confirmPassword && password !== confirmPassword) {
      errors.confirm = "Passwords do not match.";
    } else if (!confirmPassword && password) {
      errors.confirm = "Confirm your password.";
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

export const LoginView = ({
  allowSignup,
  initialFormError,
  onAuthenticated,
  onEnterPreview,
}: LoginViewProps) => {
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

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      void handleSubmit();
    }
  };

  const handleSubmit = async () => {
    const errors = validateLoginFields(
      mode,
      allowSignup,
      email,
      password,
      confirmPassword,
      hasAcceptedLegalTerms,
    );

    if (errors) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const user =
        mode === "signup"
          ? await AuthService.signup(email.trim(), password)
          : await AuthService.login(email.trim(), password);

      onAuthenticated(user);
      toast.success(mode === "signup" ? "Account created." : "Welcome back.");
    } catch (error: unknown) {
      const message =
        isApiError<AuthErrorResponse>(error) &&
        typeof error.response?.data.error === "string"
          ? error.response.data.error
          : "Authentication failed.";
      setFieldErrors({ form: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="
        relative flex min-h-[calc(100dvh-3.5rem)] items-center justify-center
        px-4 pt-14
      "
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="
            absolute top-1/3 left-1/2 size-128 -translate-1/2 rounded-full
            bg-primary/5 blur-3xl
          "
        />
      </div>
      <motion.div
        animate={{ opacity: 1, scale: 1, y: 0 }}
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        transition={LOGIN_CARD_TRANSITION}
      >
        <Card className="relative w-full max-w-md">
          <CardHeader className="items-center pb-2 text-center">
            <div className="
              relative mb-3 flex size-14 items-center justify-center
            ">
              <div
                aria-hidden="true"
                className="absolute size-18 rounded-2xl border border-border/20"
              />
              <div
                className="
                  relative flex size-14 items-center justify-center rounded-2xl
                  border border-border/50 bg-card/70 shadow-md backdrop-blur-sm
                "
              >
                <img alt="LibreRSS" className="size-6" src="/favicon.svg" />
              </div>
            </div>
            <CardTitle>
              {mode === "signup"
                ? "Create your account"
                : "Sign in to LibreRSS"}
            </CardTitle>
            <CardDescription>
              {mode === "signup"
                ? "Create an account to save your feeds and preferences."
                : "Access your saved feeds and reading preferences."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fieldErrors.form && (
              <div
                className="
                  rounded-lg border border-destructive/30 bg-destructive/10 px-3
                  py-2 text-xs text-destructive
                "
                role="alert"
              >
                {fieldErrors.form}
              </div>
            )}
            <div className="space-y-1.5">
              <Label
                className="text-xs text-muted-foreground"
                htmlFor="auth-email"
              >
                Email
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.email)}
                className={fieldErrors.email ? "border-destructive" : ""}
                id="auth-email"
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearFieldError("email");
                }}
                onKeyDown={handleKeyDown}
                placeholder="you@example.com"
                type="email"
                value={email}
              />
              <FieldError message={fieldErrors.email} />
            </div>
            <div className="space-y-1.5">
              <Label
                className="text-xs text-muted-foreground"
                htmlFor="auth-password"
              >
                Password
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.password)}
                className={fieldErrors.password ? "border-destructive" : ""}
                id="auth-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  clearFieldError("password");
                }}
                onKeyDown={handleKeyDown}
                placeholder="••••••••"
                type="password"
                value={password}
              />
              <FieldError message={fieldErrors.password} />
            </div>
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label
                    className="text-xs text-muted-foreground"
                    htmlFor="auth-confirm"
                  >
                    Confirm password
                  </Label>
                  <Input
                    aria-invalid={Boolean(fieldErrors.confirm)}
                    className={fieldErrors.confirm ? "border-destructive" : ""}
                    id="auth-confirm"
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      clearFieldError("confirm");
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="••••••••"
                    type="password"
                    value={confirmPassword}
                  />
                  <FieldError message={fieldErrors.confirm} />
                </div>
                <div className={`
                  rounded-xl border bg-muted/30 p-3
                  ${fieldErrors.legal ? "border-destructive/50" : `
                    border-border/60
                  `}
                `}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={hasAcceptedLegalTerms}
                      id="auth-legal-consent"
                      onCheckedChange={(
                        checked: "indeterminate" | boolean,
                      ) => {
                        setHasAcceptedLegalTerms(checked === true);
                        if (checked === true) clearFieldError("legal");
                      }}
                    />
                    <Label
                      className="space-y-1 text-xs/5 text-muted-foreground"
                      htmlFor="auth-legal-consent"
                    >
                      <span className="block text-foreground">
                        I accept the current Privacy Policy and Terms for this
                        deployment.
                      </span>
                      <span className="block">
                        Other LibreRSS deployments, and future versions of this
                        software, may publish different terms or data-handling
                        disclosures.
                      </span>
                    </Label>
                  </div>
                  <FieldError message={fieldErrors.legal} />
                </div>
              </>
            )}
            <Button
              className="w-full"
              disabled={isSubmitting}
              onClick={() => {
                void handleSubmit();
              }}
            >
              {isSubmitting && (
                <motion.div
                  animate={{ rotate: 360 }}
                  className="mr-2"
                  transition={{
                    duration: 0.9,
                    ease: "linear",
                    repeat: Number.POSITIVE_INFINITY,
                  }}
                >
                  <Loader2 className="size-4" />
                </motion.div>
              )}
              {mode === "signup" ? "Create account" : "Continue"}
            </Button>
            {allowSignup && (
              <Button
                className="px-0"
                disabled={isSubmitting}
                onClick={() => {
                  setMode((current) =>
                    current === "login" ? "signup" : "login",
                  );
                }}
                variant="link"
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "Need an account? Sign up"}
              </Button>
            )}
            {!allowSignup && onEnterPreview && (
              <Button
                className="w-full px-0 text-muted-foreground"
                disabled={isSubmitting}
                onClick={onEnterPreview}
                variant="link"
              >
                Explore without an account
              </Button>
            )}
            <div
              className="
                flex items-center justify-center gap-4 text-xs
                text-muted-foreground
              "
            >
              <Link
                className="
                  transition-colors
                  hover:text-foreground
                "
                href="/privacy"
              >
                Privacy Policy
              </Link>
              <Link
                className="
                  transition-colors
                  hover:text-foreground
                "
                href="/terms"
              >
                Terms
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
