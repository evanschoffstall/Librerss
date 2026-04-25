import { LoginBackgroundDecoration } from "@/app/dashboard/dashboard-components/login/LoginBackgroundDecoration";
import { LoginSkeletonField } from "@/app/dashboard/dashboard-components/login/LoginSkeletonField";
import { LoginSkeletonHeader } from "@/app/dashboard/dashboard-components/login/LoginSkeletonHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Render the login view skeleton component.
 * @returns The rendered login view skeleton component.
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
        <LoginBackgroundDecoration />

        <Card className="relative w-full max-w-md" data-login-skeleton="true">
          <LoginSkeletonHeader />

          <CardContent className="space-y-4">
            <LoginSkeletonField labelWidth="w-10" />
            <LoginSkeletonField labelWidth="w-16" />

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
