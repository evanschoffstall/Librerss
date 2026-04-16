"use client";

import { Loader2 } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

interface MotionSpinnerProps {
  className?: string;
  iconClassName?: string;
}

/** Renders a dashboard spinner using Motion instead of CSS keyframe classes. */
export function MotionSpinner({
  className,
  iconClassName,
}: MotionSpinnerProps) {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      className={cn("inline-flex shrink-0", className)}
      transition={{
        duration: 0.9,
        ease: "linear",
        repeat: Number.POSITIVE_INFINITY,
      }}
    >
      <Loader2 className={iconClassName} />
    </motion.span>
  );
}
