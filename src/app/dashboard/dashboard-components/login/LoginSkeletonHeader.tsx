import { CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function LoginSkeletonHeader() {
  return (
    <CardHeader className="items-center pb-2 text-center">
      <div className="relative mb-3 flex size-14 items-center justify-center">
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
      <Skeleton
        className="h-4.5 w-44 rounded-full"
        data-login-skeleton-title="true"
      />
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
  );
}
