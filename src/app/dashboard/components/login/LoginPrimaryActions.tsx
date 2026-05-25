import { Loader2 } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";

/**
 * Describes the props for the login primary actions component.
 */
interface LoginPrimaryActionsProps {
  allowSignup: boolean;
  hasInvitationToken?: boolean;
  isSubmitting: boolean;
  mode: "login" | "signup";
  onEnterPreview?: () => void;
  onSubmit: () => void;
  onToggleMode: () => void;
}

/**
 * Render the login primary actions component.
 * @param props - The component props.
 * @returns The rendered login primary actions component.
 */
export function LoginPrimaryActions(props: LoginPrimaryActionsProps) {
  const {
    allowSignup,
    hasInvitationToken = false,
    isSubmitting,
    mode,
    onEnterPreview,
    onSubmit,
    onToggleMode,
  } = props;
  return (
    <>
      <Button
        className="w-full"
        disabled={isSubmitting}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSubmit();
        }}
        type="button"
      >
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
      {allowSignup || hasInvitationToken ? (
        <Button
          className="px-0"
          disabled={isSubmitting}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleMode();
          }}
          type="button"
          variant="link"
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : hasInvitationToken
              ? "Use invitation"
              : "Need an account? Sign up"}
        </Button>
      ) : null}
      {!allowSignup && !hasInvitationToken && onEnterPreview ? (
        <Button
          className="w-full px-0 text-muted-foreground"
          disabled={isSubmitting}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onEnterPreview();
          }}
          type="button"
          variant="link"
        >
          Explore without an account
        </Button>
      ) : null}
    </>
  );
}
