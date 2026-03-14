"use client";

import { SearchX, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso } from "react-virtuoso";

import { getArticleKey } from "../../services/article-collection";
import { ArticleCard } from "../ArticleCard";
import { DashboardFeedListSkeleton } from "../DashboardLoadingSurfaces";

import { type Article } from "@/lib";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

interface FeedListProps {
  expandedArticleKey: null | string;
  filteredFeed: Article[];
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  onExpandedSwipeRead: (article: Article) => void;
  onToggle: (article: Article) => void;
  onToggleRead: (article: Article) => void;
  onToggleStarred: (article: Article) => void;
  pageSize: number;
  paginationResetKey: string;
  searchTerm: string;
  showFavicons: boolean;
  updatingArticleState: Record<string, boolean>;
}

interface FeedLoadMoreState {
  clientHeight: number;
  hasUserScrolled: boolean;
  scrollHeight: number;
  scrollTop: number;
  totalArticleCount: number;
  visibleArticleCount: number;
}

/** Minimum off-screen preload budget for the virtualized feed list. */
const VIRTUAL_FEED_MIN_PRELOAD_PX = 720;
/** Approximate row height used to convert the page-size preference into preload distance. */
const VIRTUAL_FEED_ROW_ESTIMATE_PX = 168;
/** Viewport distance from the bottom that should trigger the next page load. */
const FEED_LOAD_MORE_THRESHOLD_PX = VIRTUAL_FEED_ROW_ESTIMATE_PX * 3;

/**
 * Returns whether the visible feed window should expand based on the current
 * viewport position and paging state.
 */
export function shouldLoadMoreArticles({
  clientHeight,
  hasUserScrolled,
  scrollHeight,
  scrollTop,
  totalArticleCount,
  visibleArticleCount,
}: FeedLoadMoreState): boolean {
  if (!hasUserScrolled || visibleArticleCount >= totalArticleCount) {
    return false;
  }

  const remainingDistance = scrollHeight - (scrollTop + clientHeight);

  return (
    Number.isFinite(remainingDistance) &&
    remainingDistance <= FEED_LOAD_MORE_THRESHOLD_PX
  );
}

/**
 * Grid wrapper used by the virtualized list so article cards keep the existing layout.
 */
const FeedVirtuosoList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div">
>(function FeedVirtuosoList({ className, ...props }, ref) {
  return (
    <div
      {...props}
      className={
        [
          "relative mx-auto grid w-full max-w-3xl grid-cols-1 gap-1.5 px-1 lg:max-w-none lg:px-3",
          className,
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
      ref={ref}
    />
  );
});

export const FeedList = memo(function FeedList({
  expandedArticleKey,
  filteredFeed,
  hydratedArticleLinks,
  hydratingArticleLinks,
  isInitialLoading,
  isRefreshing: _isRefreshing,
  onExpandedSwipeRead,
  onToggle,
  onToggleRead,
  onToggleStarred,
  pageSize,
  paginationResetKey,
  searchTerm,
  showFavicons,
  updatingArticleState,
}: FeedListProps) {
  const isMobile = useIsMobile();
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme ?? "dark") === "dark";
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const [visibleArticleCount, setVisibleArticleCount] = useState(pageSize);
  const hasUserScrolledRef = useRef(false);
  const visibleFeed = useMemo(
    () => filteredFeed.slice(0, visibleArticleCount),
    [filteredFeed, visibleArticleCount],
  );
  const virtualFeedPreload = useMemo(
    () =>
      Math.max(
        VIRTUAL_FEED_MIN_PRELOAD_PX,
        pageSize * VIRTUAL_FEED_ROW_ESTIMATE_PX,
      ),
    [pageSize],
  );

  /**
   * Grows the rendered article window by exactly one page while retaining the
   * full selection in memory for later infinite-scroll steps.
   */
  const expandVisibleWindow = useCallback(() => {
    setVisibleArticleCount((currentCount) => {
      if (currentCount >= filteredFeed.length) {
        return currentCount;
      }

      return Math.min(currentCount + pageSize, filteredFeed.length);
    });
  }, [filteredFeed.length, pageSize]);

  useEffect(() => {
    hasUserScrolledRef.current = false;
    setVisibleArticleCount(pageSize);
  }, [pageSize, paginationResetKey]);

  useEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const maybeLoadNextPage = () => {
      if (
        shouldLoadMoreArticles({
          clientHeight: scrollViewport.clientHeight,
          hasUserScrolled: hasUserScrolledRef.current,
          scrollHeight: scrollViewport.scrollHeight,
          scrollTop: scrollViewport.scrollTop,
          totalArticleCount: filteredFeed.length,
          visibleArticleCount,
        })
      ) {
        expandVisibleWindow();
      }
    };

    const handleScrollIntent = () => {
      hasUserScrolledRef.current = true;
      maybeLoadNextPage();
    };
    const handleViewportScroll = () => {
      if (scrollViewport.scrollTop > 0) {
        hasUserScrolledRef.current = true;
      }

      maybeLoadNextPage();
    };

    scrollViewport.addEventListener("scroll", handleViewportScroll, {
      passive: true,
    });
    scrollViewport.addEventListener("touchmove", handleScrollIntent, {
      passive: true,
    });
    scrollViewport.addEventListener("wheel", handleScrollIntent, {
      passive: true,
    });

    return () => {
      scrollViewport.removeEventListener("scroll", handleViewportScroll);
      scrollViewport.removeEventListener("touchmove", handleScrollIntent);
      scrollViewport.removeEventListener("wheel", handleScrollIntent);
    };
  }, [
    expandVisibleWindow,
    filteredFeed.length,
    scrollViewport,
    visibleArticleCount,
  ]);

  /**
   * Locates the Radix viewport so the virtualized list can reuse the existing
   * dashboard scroller instead of creating a nested scrolling surface.
   */
  const handleViewportHostRef = useCallback((node: HTMLDivElement | null) => {
    const nextViewport =
      node?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ?? null;
    setScrollViewport((currentViewport) =>
      currentViewport === nextViewport ? currentViewport : nextViewport,
    );
  }, []);

  /**
   * Renders a single virtualized article row while preserving the scroll-restore key.
   */
  const renderArticleCard = useCallback(
    (article: Article, key?: string) => {
      const articleKey = getArticleKey(article);
      const articleLink = article.link.trim();

      return (
        <div
          data-scroll-restore-key={articleKey}
          key={key ?? articleKey}
          style={{ overflowAnchor: "none" }}
        >
          <ArticleCard
            article={article}
            articleKey={articleKey}
            hasScrapedContent={hydratedArticleLinks[articleLink]}
            isDark={isDark}
            isExpanded={expandedArticleKey === articleKey}
            isHydrating={hydratingArticleLinks[articleLink]}
            isMobile={isMobile}
            isUpdatingState={updatingArticleState[articleKey]}
            onExpandedSwipeRead={onExpandedSwipeRead}
            onToggle={onToggle}
            onToggleRead={onToggleRead}
            onToggleStarred={onToggleStarred}
            showFavicon={showFavicons}
            useRichFormatting={hydratedArticleLinks[articleLink]}
          />
        </div>
      );
    },
    [
      expandedArticleKey,
      hydratedArticleLinks,
      hydratingArticleLinks,
      isDark,
      isMobile,
      onExpandedSwipeRead,
      onToggle,
      onToggleRead,
      onToggleStarred,
      showFavicons,
      updatingArticleState,
    ],
  );

  return (
    <>
      {isInitialLoading ? (
        <DashboardFeedListSkeleton />
      ) : filteredFeed.length === 0 ? (
        <div
          className="
            anim-fade-in-load-slow mx-auto flex w-full max-w-3xl items-center
            justify-center px-4 py-20
            sm:py-32
            lg:max-w-none lg:px-6 lg:py-40
          "
          key="feed-empty"
        >
          <div
            className="
              anim-fade-in-load-slow flex flex-col items-center gap-6
              text-center
            "
            key={searchTerm ? "empty-search" : "empty-default"}
          >
            {/* Icon with double-ring halo */}
            <div className="relative flex items-center justify-center">
              {/* Outer glow ring */}
              <div
                className={`
                  absolute size-36 rounded-full opacity-15 blur-2xl
                  ${searchTerm ? `bg-muted-foreground` : `bg-emerald-500`}
                `}
              />
              {/* Outer decorative ring */}
              <div
                className={`
                  absolute size-28 rounded-full border
                  ${searchTerm ? `border-border/40` : `border-emerald-500/10`}
                `}
              />
              {/* Icon card */}
              <div
                className={`
                  relative flex size-20 items-center justify-center rounded-2xl
                  border bg-card/70 shadow-md backdrop-blur-sm
                  ${searchTerm ? `border-border` : `border-emerald-500/25`}
                `}
              >
                {searchTerm ? (
                  <SearchX
                    className="size-9 text-muted-foreground/55"
                    strokeWidth={1.25}
                  />
                ) : (
                  <Sparkles
                    className="size-9 text-emerald-500/70"
                    strokeWidth={1.25}
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="
                text-xl font-semibold tracking-tight text-foreground
              ">
                {searchTerm ? "No results" : "You\u2019re up to date"}
              </h3>
              {searchTerm ? (
                <div className="
                  flex max-w-[16rem] flex-col items-center gap-0.5
                  text-sm/relaxed text-muted-foreground
                ">
                  <span>Nothing matched</span>
                  <span className="
                    max-w-full truncate rounded-sm border border-border bg-muted
                    px-1.5 py-0.5 font-mono text-xs text-foreground/80
                  ">
                    {searchTerm}
                  </span>
                  <span>Try a different term.</span>
                </div>
              ) : (
                <p className="
                  max-w-[16rem] text-sm/relaxed text-muted-foreground
                ">
                  Check back later or pull for fresh articles.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div key="feed-list" ref={handleViewportHostRef}>
          {scrollViewport ? (
            <Virtuoso
              components={{ List: FeedVirtuosoList }}
              computeItemKey={(_, article) => getArticleKey(article)}
              customScrollParent={scrollViewport}
              data={visibleFeed}
              increaseViewportBy={{
                bottom: virtualFeedPreload,
                top: Math.round(virtualFeedPreload / 2),
              }}
              initialItemCount={Math.min(pageSize, visibleFeed.length)}
              itemContent={(_, article) => renderArticleCard(article)}
            />
          ) : (
            <div className="
              relative mx-auto grid w-full max-w-3xl grid-cols-1 gap-1.5 px-1
              lg:max-w-none lg:px-3
            ">
              {visibleFeed.map((article) =>
                renderArticleCard(article, getArticleKey(article)),
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
});
