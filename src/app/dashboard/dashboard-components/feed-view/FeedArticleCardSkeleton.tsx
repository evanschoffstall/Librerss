"use client";

import { type FeedArticleSkeletonDescriptor } from "@/app/dashboard/dashboard-components/feed-config";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Describes the props for the feed article card skeleton component.
 */
interface FeedArticleCardSkeletonProps {
  descriptor: FeedArticleSkeletonDescriptor;
}

/**
 * Render the feed article card skeleton component.
 * @param props - The component props.
 * @returns The rendered feed article card skeleton component.
 */
export function FeedArticleCardSkeleton(props: FeedArticleCardSkeletonProps) {
  const { descriptor } = props;
  return (
    <div
      className="relative overflow-hidden rounded-xl"
      data-dashboard-article-skeleton="true"
    >
      <article
        aria-hidden="true"
        className="
          article-swipe-surface group relative overflow-visible rounded-xl
          border border-border
          dark:shadow-2xl dark:shadow-zinc-900/50
        "
      >
        <div className="relative rounded-t-xl bg-card/70 px-3 pt-3">
          <div className="space-y-2">
            <div
              className="
                flex items-center gap-2 text-xs/5 tracking-normal
                text-muted-foreground/70 select-none
              "
            >
              <div
                className="
                flex shrink-0 items-center gap-2 whitespace-nowrap
              "
              >
                <Skeleton className="size-3 rounded-sm" />
                <Skeleton className="h-3 w-22 rounded-full" />
                <Skeleton className="size-1 shrink-0 rounded-full" />
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <Skeleton className="size-3 rounded-sm" />
                <Skeleton
                  className={cn("h-3 rounded-full", descriptor.metaSourceWidth)}
                />
              </div>
              <div
                className="
                  -mr-1 ml-auto flex shrink-0 items-center gap-1 opacity-100
                  transition-opacity duration-150
                "
              >
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
              </div>
            </div>
            <div className="space-y-4">
              <Skeleton
                className={cn("h-4 rounded-full", descriptor.titleWidths[0])}
              />
              <Skeleton
                className={cn("h-4 rounded-full", descriptor.titleWidths[1])}
              />
            </div>
          </div>
        </div>
        <div className="relative rounded-b-xl bg-card/70 px-3 pt-2 pb-3">
          <div className="py-1.5">
            <Skeleton
              className={cn("h-3 rounded-full", descriptor.bodyWidth)}
            />
          </div>
        </div>
      </article>
    </div>
  );
}
