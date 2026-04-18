import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Process the cn.
 * @param inputs - The inputs.
 * @returns The cn.
 */
export function cn(inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
