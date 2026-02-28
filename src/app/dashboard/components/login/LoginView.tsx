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
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-4 pt-14">
      <Card className="w-full max-w-md">
        <CardHeader>
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
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          {mode === "signup" && (
            <Input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onKeyDown={handleKeyDown}
            />
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
