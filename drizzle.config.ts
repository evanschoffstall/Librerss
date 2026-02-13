import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/services/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.SUPABASE_URL || "",
  },
});
