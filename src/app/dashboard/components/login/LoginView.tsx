"use client";

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
import axios from "axios";
import { Loader2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

interface LoginViewProps {
  onAuthenticated: (user: AuthUser) => void;
  allowSignup: boolean;
  onEnterPreview?: () => void;
}

export const LoginView = ({
  onAuthenticated,
  allowSignup,
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
        axios.isAxiosError(error) &&
        typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : "Authentication failed.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-4 pt-14">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-1/3 size-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>
      <Card className="anim-fade-in-load-slow relative w-full max-w-md">
        <CardHeader className="items-center pb-2 text-center">
          <div className="relative mb-3 flex size-14 items-center justify-center">
            <div
              className="absolute size-[4.5rem] rounded-2xl border border-border/20"
              aria-hidden="true"
            />
            <div className="relative flex size-14 items-center justify-center rounded-2xl border border-border/50 bg-card/70 shadow-md backdrop-blur-sm">
              <img src="/favicon.svg" alt="LibreRSS" className="size-6" />
            </div>
          </div>
          <CardTitle>
            {mode === "signup" ? "Create your account" : "Sign in to LibreRSS"}
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
              htmlFor="auth-email"
              className="text-xs text-muted-foreground"
            >
              Email
            </Label>
            <Input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="auth-password"
              className="text-xs text-muted-foreground"
            >
              Password
            </Label>
            <Input
              id="auth-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label
                htmlFor="auth-confirm"
                className="text-xs text-muted-foreground"
              >
                Confirm password
              </Label>
              <Input
                id="auth-confirm"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          )}
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === "signup" ? "Create account" : "Continue"}
          </Button>
          {allowSignup && (
            <Button
              variant="link"
              className="px-0"
              onClick={() =>
                setMode((current) => (current === "login" ? "signup" : "login"))
              }
              disabled={isSubmitting}
            >
              {mode === "signup"
                ? "Already have an account? Sign in"
                : "Need an account? Sign up"}
            </Button>
          )}
          {!allowSignup && onEnterPreview && (
            <Button
              variant="link"
              className="w-full px-0 text-muted-foreground"
              onClick={onEnterPreview}
              disabled={isSubmitting}
            >
              Explore without an account
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
