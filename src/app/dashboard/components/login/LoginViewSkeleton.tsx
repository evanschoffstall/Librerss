import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level login loading shell that mirrors the exact card layout of LoginView.
 *
 * Shown as the Suspense fallback on `/dashboard` when the SSR-resolved session
 * indicates the user is unauthenticated. Matching the card structure, logo slot,
 * field rows, and action area prevents a jarring layout shift when the real
 * LoginView mounts after hydration.
 */
export function LoginViewSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading login"
      className="h-full overflow-hidden bg-background"
    >
      <div
        className="
          relative flex min-h-[calc(100dvh-3.5rem)] items-center justify-center
          px-4 pt-14
        "
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div
            className="
              absolute top-1/3 left-1/2 size-128 -translate-1/2 rounded-full
              bg-primary/5 blur-3xl
            "
          />
        </div>

        <Card className="relative w-full max-w-md" data-login-skeleton="true">
          <CardHeader className="items-center pb-2 text-center">
            {/* Logo slot — outer ring + inner icon shell */}
            <div className="
              relative mb-3 flex size-14 items-center justify-center
            ">
              <div
                aria-hidden="true"
                className="absolute size-18 rounded-2xl border border-border/20"
              />
              <Skeleton
                className="
                  relative size-14 rounded-2xl border border-border/50 shadow-md
                "
                data-login-skeleton-logo="true"
              />
            </div>

            {/* Title row */}
            <Skeleton
              className="h-4.5 w-44 rounded-full"
              data-login-skeleton-title="true"
            />

            {/* Description — two-line approximation */}
            <div className="mt-1.5 w-full space-y-1.5">
              <Skeleton
                className="mx-auto h-3.5 w-[80%] rounded-full"
                data-login-skeleton-description="true"
              />
              <Skeleton
                className="mx-auto h-3.5 w-[62%] rounded-full"
                data-login-skeleton-description="true"
              />
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Email field */}
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-10 rounded-full" />
              <Skeleton
                className="h-9 w-full rounded-md"
                data-login-skeleton-input="true"
              />
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16 rounded-full" />
              <Skeleton
                className="h-9 w-full rounded-md"
                data-login-skeleton-input="true"
              />
            </div>

            {/* Primary action button */}
            <Skeleton
              className="h-9 w-full rounded-md"
              data-login-skeleton-button="true"
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
