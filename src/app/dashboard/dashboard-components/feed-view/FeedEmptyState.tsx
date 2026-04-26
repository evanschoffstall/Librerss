import { CheckCheck, Rss, SearchX, Sparkles } from "lucide-react";

import { type ArticleFilter } from "@/app/dashboard/dashboard-services/article";

/**
 * Describes the props for the feed empty state component.
 */
interface FeedEmptyStateProps {
  articleFilter: ArticleFilter;
  hasConfiguredFeeds?: boolean;
  hasSearchTerm: boolean;
  trimmedSearchTerm: string;
}

/**
 * Render the feed empty state component.
 * @param props - The component props.
 * @returns The rendered feed empty state component.
 */
export function FeedEmptyState(props: FeedEmptyStateProps) {
  const {
    articleFilter,
    hasConfiguredFeeds = true,
    hasSearchTerm,
    trimmedSearchTerm,
  } = props;
  const {
    description,
    heading,
    icon: EmptyStateIcon,
  } = resolveEmptyStateContent(
    hasSearchTerm,
    hasConfiguredFeeds,
    articleFilter,
  );

  return (
    <div
      className="
        relative isolate flex min-h-72 w-full max-w-2xl flex-col items-center
        justify-center px-6 py-10 text-center
        sm:min-h-80 sm:px-8 sm:py-12
      "
      data-feed-empty-state="true"
    >
      <div
        aria-hidden="true"
        className="
          absolute inset-x-10 top-0 h-24 rounded-full bg-primary/10 blur-3xl
        "
      />
      <div
        aria-hidden="true"
        className="
          absolute inset-x-20 bottom-0 h-20 rounded-full bg-foreground/5
          blur-3xl
        "
      />
      <div
        className="
          relative mb-5 inline-flex size-12 items-center justify-center
          rounded-full border border-border/70 bg-background/80
          text-muted-foreground/75
        "
      >
        <EmptyStateIcon className="size-4" />
      </div>
      <div className="relative space-y-2">
        <h3 className="text-xl font-semibold tracking-tight text-foreground">
          {heading}
        </h3>
        {hasSearchTerm ? (
          <div
            className="
              flex max-w-[16rem] flex-col items-center gap-0.5 text-sm/relaxed
              text-muted-foreground
            "
          >
            <span>Nothing matched</span>
            <span
              className="
                max-w-full truncate rounded-sm border border-border bg-muted
                px-1.5 py-0.5 font-mono text-xs text-foreground/80
              "
            >
              {trimmedSearchTerm}
            </span>
            <span>Try a different term.</span>
          </div>
        ) : (
          <p className="max-w-[16rem] text-sm/relaxed text-muted-foreground">
            {description ?? "Try back later or refresh."}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Resolve the empty state content.
 * @param hasSearchTerm - Whether has search term.
 * @param hasConfiguredFeeds - Whether has configured feeds.
 * @param articleFilter - The article filter.
 * @returns The empty state content.
 */
function resolveEmptyStateContent(
  hasSearchTerm: boolean,
  hasConfiguredFeeds: boolean,
  articleFilter: ArticleFilter,
) {
  if (hasSearchTerm) {
    return { heading: "No results", icon: SearchX };
  }
  if (!hasConfiguredFeeds) {
    return {
      description: "Add your feeds in Settings to start reading.",
      heading: "No feed sources yet",
      icon: Rss,
    };
  }
  if (articleFilter === "starred") {
    return {
      description: "Articles you star will show up here.",
      heading: "No starred articles yet",
      icon: Sparkles,
    };
  }
  return { heading: "You're up to date", icon: CheckCheck };
}
