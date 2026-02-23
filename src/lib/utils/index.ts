// Utility barrel - re-export all utility functions for cleaner imports
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export * from "./categories";
export * from "./date-utils";
export * from "./errors";
export * from "./logger";
export * from "./sanitize";
export * from "./url";
export * from "./validation";
