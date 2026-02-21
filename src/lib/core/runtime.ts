export {
  getPlaceholderArticlesForSource,
  PLACEHOLDER_ARTICLES,
  PLACEHOLDER_CATEGORY,
  PLACEHOLDER_FEED_SOURCES,
} from "./placeholder";

const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL?.trim());

export const RUNTIME_FLAGS = {
  hasSupabaseUrl,
  usePlaceholderData: !hasSupabaseUrl,
} as const;

export const PLACEHOLDER_ADMIN_USER = {
  id: 0,
  email: "admin@admin.com",
  passwordHash:
    "placeholder-admin-salt:fa68d3bb667b1689527c99821adac9c2e02910bfa20e34bfc0a9a5a6c239edc80ae30f8b59dd6c37cebc0d6919b26ae68848cb0e56cbf81108e43327765bfeb2",
  sessionToken: "librerss-placeholder-admin-session",
} as const;
