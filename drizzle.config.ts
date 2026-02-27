import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";

function readDatabaseUrlFromEnvFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, "utf8");
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("DATABASE_URL="));

  if (!line) return null;

  const rawValue = line.slice("DATABASE_URL=".length).trim();
  if (!rawValue) return null;

  return rawValue.replace(/^['"]|['"]$/g, "");
}

function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl && !envUrl.includes("@host:")) {
    return envUrl;
  }

  return (
    readDatabaseUrlFromEnvFile(".env.local") ??
    readDatabaseUrlFromEnvFile(".env") ??
    envUrl ??
    ""
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
