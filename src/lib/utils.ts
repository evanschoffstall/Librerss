// Utility functions for the application

/**
 * Generate a random number between min and max
 */
export const getRandomNumber = (max: number, min: number = 0): number =>
  Math.random() * (max - min) + min;

/**
 * Check if we're running on the client side
 */
export const isClient = (): boolean => typeof window !== "undefined";

/**
 * Format a date to a readable string
 */
export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

/**
 * Calculate time difference in minutes
 */
export const getTimeDifferenceInMinutes = (
  date1: Date,
  date2: Date
): number => {
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
};

/**
 * Truncate text to a specified length
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
};

/**
 * Validate URL format
 */
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};
