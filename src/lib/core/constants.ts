// Application constants for LibreRSS

// API constants
export const API_CONSTANTS = {
  FEED_CACHE_DURATION_MINUTES: 15,
} as const;

// Environment constants
export const ENV = {
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
} as const;
