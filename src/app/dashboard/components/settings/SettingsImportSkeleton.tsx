import { Skeleton } from "@/components/ui/skeleton";

/** Loading skeleton shown while OPML feeds are being imported. */
export function SettingsImportSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-md border px-0">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Skeleton className="size-6 rounded" />
            <div className="flex flex-1 items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
            <div className="flex gap-0.5">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          </div>
          {i < 3 && (
            <div className="space-y-1.5 px-3 pb-3">
              {Array.from({ length: 2 + (i % 2) }).map((_, j) => (
                <div
                  key={j}
                  className="flex items-center gap-2 rounded-md border px-3 py-2"
                >
                  <Skeleton className="size-6 rounded" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-44" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Skeleton className="size-7 rounded-md" />
                    <Skeleton className="size-7 rounded-md" />
                    <Skeleton className="size-7 rounded-md" />
                    <Skeleton className="h-4 w-px" />
                    <Skeleton className="size-7 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <p className="text-center text-xs text-muted-foreground pt-1">
        Importing feeds…
      </p>
    </div>
  );
}
