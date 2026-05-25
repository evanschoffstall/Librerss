"use client";

import { Loader2 } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Describes the props for the motion spinner component.
 */
interface MotionSpinnerProps {
  className?: string;
  iconClassName?: string;
}

/**
 * Render the motion spinner component.
 * @param props - The component props.
 * @returns The rendered motion spinner component.
 */
export function MotionSpinner(props: MotionSpinnerProps) {
  const { className, iconClassName } = props;
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
