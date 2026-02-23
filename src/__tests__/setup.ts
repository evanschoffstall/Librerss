/**
 * Global Test Setup
 * Runs before all tests
 */

// Set test environment variables
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgres://test:test@localhost:5432/librerss_test";
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "test-session-secret-min-32-chars-long-value";
}
if (!process.env.CSRF_SECRET) {
  process.env.CSRF_SECRET = "test-csrf-secret-min-32-chars";
}
