/**
 * Next.js instrumentation hook — runs once when the server starts.
 *
 * Note: `register()` fires before `@next/env` loads `.env` files in many
 * Next.js runtimes (dev, build, Vercel cold starts), so we cannot validate
 * env vars here — they aren't populated yet. The CONFIG Proxy in
 * `src/lib/config.ts` already throws a clear "Missing required environment
 * variable" error on first access of any undefined key, which is the
 * effective runtime safety net.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export function register() {
  // Intentionally empty — env validation is handled lazily by CONFIG.
}
