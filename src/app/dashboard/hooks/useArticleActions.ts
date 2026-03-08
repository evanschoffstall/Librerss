"use client";

import { ArticleService, type Article, type CategoryTreeNode } from "@/lib";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getArticleKey } from "../services/article-collection";
import {
  escapeArticleKey,
  useArticleHydration,
  type FeedExtractionSettings,
} from "./useArticleHydration";
import { useArticleReadState } from "./useArticleReadState";

const ARTICLE_REMOVAL_ANIMATION_MS = 320;

export const toggleReadStatus = (isRead: boolean) => !isRead;
export const toggleStarredStatus = (isStarred: boolean) => !isStarred;

interface UseArticleActionsOptions {
  feed: Article[];
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  expandedArticleKey: string | null;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<string | null>>;
  articleFilter: "all" | "unread" | "read" | "starred";
  usePlaceholderData?: boolean;
  categories?: CategoryTreeNode[];
  /** Called when any article begins expanding; settles scroll restore. */
  onExpand?: () => void;
  /**
   * ── CRITICAL: Scroll-pin ref (expand & collapse) ───────────────────────
   * DO NOT REMOVE. This took 10+ iterations to get right.
   *
   * Shared ref coordinating useArticleActions ↔ usePullDownToRefresh.
   *
   * Problem: during both expand and collapse, the CSS max-height
   * transition changes scrollHeight progressively. Browser scroll
   * anchoring and ResizeObserver layout adjustments shift scrollTop,
   * causing the viewport to jump (typically to the bottom on collapse,
   * or erratically during expand).
   *
   * Solution: set this ref to the current scrollTop at the start of
   * expand or collapse. The ResizeObserver in usePullDownToRefresh
   * detects the numeric value and on every resize: (a) pads the bottom
   * so scrollHeight stays large enough, (b) re-pins viewport.scrollTop
   * to the target. After the CSS transition ends, we release to `false`.
   *
   * - `false` → normal sentinel enforcement.
   * - `number > 0` → pin mode: ResizeObserver holds scrollTop (collapse).
   * - `-1` → suppress mode: ResizeObserver skips entirely (expand).
   * ─────────────────────────────────────────────────────────────────────
   */
  suppressSnapRef?: React.RefObject<number | false>;
}

export function useArticleActions({
  feed,
  setFeed,
  expandedArticleKey,
  setExpandedArticleKey,
  articleFilter,
  usePlaceholderData = false,
  categories,
  onExpand,
  suppressSnapRef,
}: UseArticleActionsOptions) {
  const {
    updatingArticleState,
    setUpdatingArticleState,
    setArticleReadState,
    handleToggleReadState,
  } = useArticleReadState({ setFeed, usePlaceholderData });

  // Build a feedUrl → settings lookup from the category tree
  const getFeedSettings = useMemo(() => {
    const settingsMap = new Map<string, FeedExtractionSettings>();
    for (const cat of categories ?? []) {
      for (const child of cat.children ?? []) {
        if (child.data?.url) {
          settingsMap.set(child.data.url, {
            extractionDisabled: child.data.extractionDisabled,
            proxyEnabled: child.data.proxyEnabled,
          });
        }
      }
    }
    return (feedUrl: string) => settingsMap.get(feedUrl);
  }, [categories]);

  const {
    hydratedArticleLinks,
    hydratingArticleLinks,
    hydrateArticleContent,
    cancelHydration,
  } = useArticleHydration({ setFeed, getFeedSettings });
  const autoHydratedExpandedKeyRef = useRef<string | null>(null);
  const awaitingExpandedSyncKeyRef = useRef<string | null>(null);

  // When the feed loads after a hot-reload or page refresh, the expandedArticleKey
  // is restored from sessionStorage but hydratedArticleLinks is in-memory only.
  // Re-trigger hydration so the article gets its rich content back automatically.
  useEffect(() => {
    if (!expandedArticleKey) {
      if (!awaitingExpandedSyncKeyRef.current) {
        autoHydratedExpandedKeyRef.current = null;
      }
      return;
    }

    if (awaitingExpandedSyncKeyRef.current === expandedArticleKey) {
      awaitingExpandedSyncKeyRef.current = null;
    }

    if (autoHydratedExpandedKeyRef.current === expandedArticleKey) {
      return;
    }

    if (feed.length === 0) return;

    const article = feed.find((a) => getArticleKey(a) === expandedArticleKey);
    const link = article?.link?.trim() ?? "";
    if (
      article &&
      link &&
      !hydratedArticleLinks[link] &&
      !hydratingArticleLinks[link]
    ) {
      autoHydratedExpandedKeyRef.current = expandedArticleKey;
      void hydrateArticleContent(article);
    }
  }, [
    feed,
    expandedArticleKey,
    hydratedArticleLinks,
    hydratingArticleLinks,
    hydrateArticleContent,
  ]);

  const feedRef = useRef(feed);
  feedRef.current = feed;

  const collapseRemovalTimeoutRef = useRef<number | null>(null);
  /** Cleanup for the in-flight scroll-pin timeout (expand or collapse). */
  const pinCleanupRef = useRef<(() => void) | null>(null);
  /** Viewport + scrollTop captured at expand time for collapse scroll-restore. */
  const preExpandVpRef = useRef<HTMLElement | null>(null);
  const preExpandTopRef = useRef<number | null>(null);
  const [collapsingArticleKey, setCollapsingArticleKey] = useState<
    string | null
  >(null);

  useEffect(
    () => () => {
      if (collapseRemovalTimeoutRef.current !== null)
        window.clearTimeout(collapseRemovalTimeoutRef.current);
      pinCleanupRef.current?.();
    },
    [],
  );

  const handleArticleToggle = useCallback(
    async (article: Article) => {
      const nextArticleKey = getArticleKey(article);
      const isCollapsing = expandedArticleKey === nextArticleKey;

      setExpandedArticleKey((current) =>
        current === nextArticleKey ? null : nextArticleKey,
      );

      if (isCollapsing) {
        awaitingExpandedSyncKeyRef.current = null;
        autoHydratedExpandedKeyRef.current = null;
        const link = article.link?.trim();
        if (link) cancelHydration(link);

        // ── Collapse scroll-pin ──────────────────────────────────────
        // DO NOT REMOVE — this is the fix for the "scroll jumps to bottom
        // on collapse" bug. See suppressSnapRef JSDoc above for why.
        //
        // Pin scrollTop at the pre-expand value. The ResizeObserver in
        // usePullDownToRefresh holds it stable while the CSS transition
        // shrinks the card, then we release the pin after transition.
        // ────────────────────────────────────────────────────────────────
        pinCleanupRef.current?.();
        pinCleanupRef.current = null;

        const savedVp = preExpandVpRef.current;
        const savedTop = preExpandTopRef.current;
        preExpandVpRef.current = null;
        preExpandTopRef.current = null;

        const pinTarget = savedTop ?? 104;
        if (suppressSnapRef) suppressSnapRef.current = pinTarget;
        if (savedVp) savedVp.scrollTop = pinTarget;

        const collapseDuration =
          typeof getComputedStyle === "function"
            ? parseFloat(
                getComputedStyle(document.body).getPropertyValue(
                  "--motion-duration-expand",
                ),
              ) || 240
            : 240;

        const releaseId = window.setTimeout(() => {
          if (suppressSnapRef) suppressSnapRef.current = false;
        }, collapseDuration + 80);

        pinCleanupRef.current = () => {
          window.clearTimeout(releaseId);
          if (suppressSnapRef) suppressSnapRef.current = false;
        };

        // Animate removal from the unread filter for read articles.
        const isRemovingFromFilter =
          articleFilter === "unread" && article.isRead;
        if (isRemovingFromFilter) {
          if (collapseRemovalTimeoutRef.current !== null) {
            window.clearTimeout(collapseRemovalTimeoutRef.current);
          }
          setCollapsingArticleKey(nextArticleKey);
          collapseRemovalTimeoutRef.current = window.setTimeout(() => {
            setCollapsingArticleKey((current) =>
              current === nextArticleKey ? null : current,
            );
            collapseRemovalTimeoutRef.current = null;
          }, ARTICLE_REMOVAL_ANIMATION_MS);
        }
        return;
      }

      // Cancel any in-progress scroll pin / collapse removal.
      if (collapseRemovalTimeoutRef.current !== null) {
        window.clearTimeout(collapseRemovalTimeoutRef.current);
        collapseRemovalTimeoutRef.current = null;
      }
      pinCleanupRef.current?.();
      pinCleanupRef.current = null;
      setCollapsingArticleKey(null);

      // Kill the scroll-restore window.
      onExpand?.();

      // Capture scroll position before layout changes for collapse restore.
      preExpandVpRef.current = null;
      preExpandTopRef.current = null;
      try {
        const el = document.querySelector<HTMLElement>(
          `[data-article-key="${escapeArticleKey(nextArticleKey)}"]`,
        );
        const vp =
          el?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ?? null;
        if (el && vp) {
          preExpandVpRef.current = vp;
          preExpandTopRef.current = vp.scrollTop;

          // ── Expand scroll-suppress ─────────────────────────────────
          // During the CSS expand transition, the ResizeObserver's
          // ensureMinOverflow() and sentinel snap-back interfere with
          // browser scroll anchoring and user scrolling. Setting -1
          // tells the ResizeObserver to bail entirely. Released when
          // the actual max-height transitionend fires on the article
          // element (NOT a fixed timeout — hydration latency means the
          // CSS transition starts well after toggle).
          // ────────────────────────────────────────────────────────────
          if (suppressSnapRef) suppressSnapRef.current = -1;

          const release = () => {
            if (suppressSnapRef) suppressSnapRef.current = false;
          };

          const onTransitionEnd = (e: TransitionEvent) => {
            if (e.propertyName !== "max-height") return;
            el.removeEventListener("transitionend", onTransitionEnd);
            window.clearTimeout(fallbackId);
            window.setTimeout(release, 80);
          };
          el.addEventListener("transitionend", onTransitionEnd);

          // Safety fallback if transitionend never fires.
          const fallbackId = window.setTimeout(() => {
            el.removeEventListener("transitionend", onTransitionEnd);
            release();
          }, 3000);

          pinCleanupRef.current = () => {
            el.removeEventListener("transitionend", onTransitionEnd);
            window.clearTimeout(fallbackId);
            release();
          };
        }
      } catch {
        /* ignore */
      }

      if (!article.isRead && !updatingArticleState[nextArticleKey]) {
        void setArticleReadState(article, true, { suppressErrorToast: true });
      }

      // Mark as handled so the auto-hydration effect skips this key.
      awaitingExpandedSyncKeyRef.current = nextArticleKey;
      autoHydratedExpandedKeyRef.current = nextArticleKey;
      await hydrateArticleContent(article);
    },
    [
      articleFilter,
      cancelHydration,
      expandedArticleKey,
      onExpand,
      suppressSnapRef,
      updatingArticleState,
      setExpandedArticleKey,
      setArticleReadState,
      hydrateArticleContent,
    ],
  );

  const handleToggleStarredState = useCallback(
    async (article: Article) => {
      const articleKey = getArticleKey(article);
      const nextStarredState = !article.isStarred;

      setUpdatingArticleState((current) => ({
        ...current,
        [articleKey]: true,
      }));

      setFeed((currentFeed) => {
        const updated = currentFeed.map((a) =>
          getArticleKey(a) === articleKey
            ? { ...a, isStarred: nextStarredState }
            : a,
        );
        if (articleFilter === "starred" && !nextStarredState) {
          return updated.filter((a) => getArticleKey(a) !== articleKey);
        }
        return updated;
      });

      try {
        if (!usePlaceholderData) {
          await ArticleService.updateArticleStatus(article.id, {
            isStarred: nextStarredState,
          });
        }
      } catch (error) {
        console.error("Toggle starred state error:", error);
        setFeed((currentFeed) => {
          const reverted = currentFeed.map((a) =>
            getArticleKey(a) === articleKey
              ? { ...a, isStarred: article.isStarred }
              : a,
          );

          if (articleFilter === "starred" && article.isStarred) {
            const alreadyPresent = reverted.some(
              (a) => getArticleKey(a) === articleKey,
            );
            if (!alreadyPresent) return [article, ...reverted];
          }

          return reverted;
        });
        toast.error("Unable to update starred state right now.");
      } finally {
        setUpdatingArticleState(({ [articleKey]: _, ...rest }) => rest);
      }
    },
    [articleFilter, setFeed, setUpdatingArticleState, usePlaceholderData],
  );

  return {
    updatingArticleState,
    hydratedArticleLinks,
    hydratingArticleLinks,
    collapsingArticleKey,
    handleArticleToggle,
    handleToggleReadState,
    handleToggleStarredState,
    setArticleReadState,
  };
}
