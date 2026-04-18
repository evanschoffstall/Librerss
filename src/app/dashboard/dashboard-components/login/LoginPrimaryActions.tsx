import { Loader2 } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";

interface LoginPrimaryActionsProps {
  allowSignup: boolean;
  isSubmitting: boolean;
  mode: "login" | "signup";
  onEnterPreview?: () => void;
  onSubmit: () => void;
  onToggleMode: () => void;
}

/**
 * @param root0
 * @param root0.allowSignup
 * @param root0.isSubmitting
 * @param root0.mode
 * @param root0.onEnterPreview
 * @param root0.onSubmit
 * @param root0.onToggleMode
 */
export function LoginPrimaryActions({
  allowSignup,
  isSubmitting,
  mode,
  onEnterPreview,
  onSubmit,
  onToggleMode,
}: LoginPrimaryActionsProps) {
  return (
    <>
      <Button className="w-full" disabled={isSubmitting} onClick={onSubmit}>
        {isSubmitting ? (
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
        ) : null}
        {mode === "signup" ? "Create account" : "Continue"}
      </Button>
      {allowSignup ? (
        <Button
          className="px-0"
          disabled={isSubmitting}
          onClick={onToggleMode}
          variant="link"
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "Need an account? Sign up"}
        </Button>
      ) : null}
      {!allowSignup && onEnterPreview ? (
        <Button
          className="w-full px-0 text-muted-foreground"
          disabled={isSubmitting}
          onClick={onEnterPreview}
          variant="link"
        >
          Explore without an account
        </Button>
      ) : null}
    </>
  );
}
