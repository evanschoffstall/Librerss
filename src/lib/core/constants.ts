// Application constants for LibreRSS

// Space component constants
export const SPACE_CONSTANTS = {
  MAX_PERCENTAGE: 100,
  MAX_STAR_SIZE: 3,
  MAX_GLOW_TIME: 10,
  MAX_TWINKLE_TIME: 15,
  STAR_COUNT: 50, // Reduced from 100 for better performance
} as const;

// API constants
export const API_CONSTANTS = {
  FEED_CACHE_DURATION_MINUTES: 15,
} as const;

// Environment constants
export const ENV = {
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
} as const;
