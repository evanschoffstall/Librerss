import { Skeleton } from "@/components/ui/skeleton";

/**
 * Render the settings import skeleton component.
 * @returns The rendered settings import skeleton component.
 */
export function SettingsImportSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="rounded-md border px-0" key={i}>
          {/* Category header: drag handle + label + feed count + actions */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Skeleton className="size-4 rounded-sm" />
            <div className="flex flex-1 items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          </div>

          {/* Feed rows: only first three categories have visible children */}
          {i < 3 && (
            <div className="space-y-1.5 px-3 pb-3">
              {Array.from({ length: 2 + (i % 2) }).map((_, j) => (
                <div
                  className="
                    flex items-center gap-2 rounded-md border px-3 py-2
                  "
                  key={j}
                >
                  <Skeleton className="size-4 rounded-sm" />
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* Feed name — text-sm */}
                    <Skeleton className="h-3.5 w-32" />
                    {/* Feed URL — text-xs */}
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Extraction, proxy, enable/disable toggles */}
                    <Skeleton className="size-7 rounded-md" />
                    <Skeleton className="size-7 rounded-md" />
                    <Skeleton className="size-7 rounded-md" />
                    {/* Vertical separator */}
                    <div className="mx-0.5 h-4 w-px" />
                    {/* Remove button */}
                    <Skeleton className="size-7 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <p className="pt-1 text-center text-xs text-muted-foreground">
        Importing feeds…
      </p>
    </div>
  );
}
