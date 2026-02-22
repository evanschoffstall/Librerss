// Application constants for LibreRSS

// Environment constants
export const ENV = {
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
} as const;
