/** Public application name shown in metadata and shared landing redirects. */
export const PUBLIC_APP_NAME = "LibreRSS";

/** Stable public routes used by top-level app navigation decisions. */
export const PUBLIC_APP_PATHS = {
  dashboard: "/dashboard",
  landing: "/landing",
} as const;

/** Public brand asset paths used by app metadata and shell chrome. */
export const PUBLIC_BRAND_ASSETS = {
  favicon: "/favicon.svg",
  logo: "/favicon.svg",
} as const;
