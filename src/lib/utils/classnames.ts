import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges Tailwind-aware class name inputs into one normalized string. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
