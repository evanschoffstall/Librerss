"use client";

import axios from "axios";
import { Loader2 } from "lucide-react";
import { motion } from "motion/react";
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthService, type AuthUser } from "@/lib";

interface AuthErrorResponse {
  error?: unknown;
}

interface LoginViewProps {
  allowSignup: boolean;
  onAuthenticated: (user: AuthUser) => void;
  onEnterPreview?: () => void;
}

const LOGIN_CARD_TRANSITION = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1] as const,
};

export const LoginView = ({
  allowSignup,
  onAuthenticated,
  onEnterPreview,
}: LoginViewProps) => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      void handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (mode === "signup" && !allowSignup) {
      toast.error("Signup is disabled by server configuration.");
      return;
    }

    if (!email.trim() || !password) {
      toast.error("Email and password are required.");
      return;
    }

    if (mode === "signup") {
      if (password.length < 8) {
        toast.error("Password must be at least 8 characters.");
        return;
      }

      if (password !== confirmPassword) {
        toast.error("Passwords do not match.");
        return;
      }
    }

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
        axios.isAxiosError<AuthErrorResponse>(error) &&
        typeof error.response?.data.error === "string"
          ? error.response.data.error
          : "Authentication failed.";
      toast.error(message);
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
            <div className="space-y-1.5">
              <Label
                className="text-xs text-muted-foreground"
                htmlFor="auth-email"
              >
                Email
              </Label>
              <Input
                id="auth-email"
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder="you@example.com"
                type="email"
                value={email}
              />
            </div>
            <div className="space-y-1.5">
              <Label
                className="text-xs text-muted-foreground"
                htmlFor="auth-password"
              >
                Password
              </Label>
              <Input
                id="auth-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder="••••••••"
                type="password"
                value={password}
              />
            </div>
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label
                  className="text-xs text-muted-foreground"
                  htmlFor="auth-confirm"
                >
                  Confirm password
                </Label>
                <Input
                  id="auth-confirm"
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="••••••••"
                  type="password"
                  value={confirmPassword}
                />
              </div>
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
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
