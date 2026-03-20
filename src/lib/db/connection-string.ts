const PG_SSLMODE_VERIFY_FULL_ALIASES = new Set([
  "prefer",
  "require",
  "verify-ca",
]);

/**
 * Normalizes PostgreSQL SSL query params for pg-compatible clients.
 *
 * Current pg releases still treat `prefer`, `require`, and `verify-ca` as
 * aliases for `verify-full`, but now emit a warning because future releases
 * will switch to standard libpq semantics. Upgrading those legacy aliases to
 * `verify-full` keeps today's secure behavior and silences the warning.
 *
 * When the URL explicitly opts into libpq compatibility via
 * `uselibpqcompat=true`, the string is left untouched.
 */
export function normalizePostgresConnectionString(
  connectionString: string,
): string {
  let parsedConnectionString: URL;

  try {
    parsedConnectionString = new URL(connectionString);
  } catch {
    return connectionString;
  }

  if (
    parsedConnectionString.protocol !== "postgres:" &&
    parsedConnectionString.protocol !== "postgresql:"
  ) {
    return connectionString;
  }

  if (usesLibpqCompatibility(parsedConnectionString.searchParams)) {
    return connectionString;
  }

  const sslMode = parsedConnectionString.searchParams.get("sslmode");
  if (!sslMode) {
    return connectionString;
  }

  if (!PG_SSLMODE_VERIFY_FULL_ALIASES.has(sslMode.toLowerCase())) {
    return connectionString;
  }

  parsedConnectionString.searchParams.set("sslmode", "verify-full");

  return parsedConnectionString.toString();
}

function usesLibpqCompatibility(searchParams: URLSearchParams): boolean {
  const rawValue = searchParams.get("uselibpqcompat")?.trim().toLowerCase();

  return rawValue === "1" || rawValue === "on" || rawValue === "true";
}