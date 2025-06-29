// Utility functions for LibreRSS

export const getRandomNumber = (max: number, min: number = 0): number =>
  Math.random() * (max - min) + min;

export const isClient = (): boolean => typeof window !== "undefined";

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const getTimeDifferenceInMinutes = (date1: Date, date2: Date): number => {
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};
