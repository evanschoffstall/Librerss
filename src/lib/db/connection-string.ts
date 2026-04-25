const PG_SSLMODE_VERIFY_FULL_ALIASES = new Set([
  "prefer",
  "require",
  "verify-ca",
]);

/**
 * Normalize the postgres connection string.
 * @param connectionString - The connection string.
 * @returns The postgres connection string.
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

/**
 * Process the s libpq compatibility.
 * @param searchParams - The search params.
 * @returns Whether s libpq compatibility.
 */
function usesLibpqCompatibility(searchParams: URLSearchParams): boolean {
  const rawValue = searchParams.get("uselibpqcompat")?.trim().toLowerCase();

  return rawValue === "1" || rawValue === "on" || rawValue === "true";
}
