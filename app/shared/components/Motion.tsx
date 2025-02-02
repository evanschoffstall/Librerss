'use client';

import React, { ReactNode } from "react";
import { motion, Variants, Transition } from "framer-motion";

// Define the animation variants
const variants: Variants = {
  fadeIn: { opacity: 0, y: 0 },
  fadeInDown: { opacity: 0, y: -50 },
  fadeInUp: { opacity: 0, y: 50 },
  fadeInRight: { opacity: 0, x: -100 },
  fadeInLeft: { opacity: 0, x: 100 },
};

// Default transition properties
const defaultTransition: Transition = { duration: 1, ease: "easeOut", delay: 0.7 };

// Extend props to include standard div attributes
interface MotionProps extends React.HTMLAttributes<HTMLDivElement> {
  variant: keyof typeof variants; // Only valid keys from variants
  children: ReactNode;
  transition?: Transition; // Optional transition prop
}

// Merges user-provided transition with the default values
const mergeTransition = (userTransition?: Transition): Transition => {
  return { ...defaultTransition, ...userTransition };
};

// Updated Motion component with optional transition handling
const Motion: React.FC<MotionProps> = ({ variant, className, children, transition }) => {
  return (
    <motion.div
      initial={variant as string} // Use the variant name directly
      animate={{ opacity: 1, x: 0, y: 0 }}
      variants={variants} // Pass the variants object
      transition={mergeTransition(transition)} // Merge provided transition with default
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default Motion;
