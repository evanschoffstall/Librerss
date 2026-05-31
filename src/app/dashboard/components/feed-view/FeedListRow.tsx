import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  DASHBOARD_SHELL_HANDOFF_OPACITY_DELAY_MS,
  DASHBOARD_SHELL_HANDOFF_OPACITY_DURATION_MS,
  DASHBOARD_SHELL_HANDOFF_TOTAL_DONE_MS,
} from "@/app/dashboard/components/dashboard-shell-handoff";
import {
  FEED_ARTICLE_SKELETONS,
  FEED_ROW_COLLAPSE_FLOOR_PX,
  FEED_ROW_GAP_PX,
  type FeedArticleSkeletonDescriptor,
} from "@/app/dashboard/components/feed-config";
import { FeedArticleCardSkeleton } from "@/app/dashboard/components/feed-view/FeedArticleCardSkeleton";
import { type FeedListRowProps } from "@/app/dashboard/components/feed-view/FeedList.types";
import { getArticleRemovalAnimationDuration } from "@/app/dashboard/display-types";

/**
 * The three phases of the entrance animation:
 * - "none": article is not entering (idle post-load)
 * - "initial": skeleton-backed row is mounted with hydrated content hidden
 * - "animating": hydrated content fades in over the stable skeleton footprint
 * - "done": settled; inline override styles cleared; onEnteringDone fired.
 */
type EnterPhase = "animating" | "done" | "initial" | "none";
/**
 * Defines the feed row release phase type.
 */
type FeedRowReleasePhase = "collapsing" | "fading" | "idle";

const FEED_ROW_COLLAPSE_OFFSET_PX = FEED_ROW_COLLAPSE_FLOOR_PX;

export const FeedListRow = memo(
  /**
   * Render the feed list row component.
   * @param props - The component props.
   * @returns The rendered feed list row component.
   */
  function FeedListRow(props: FeedListRowProps) {
    const {
      articleKey,
      children,
      hasTrailingGap,
      isEntering = false,
      isExpanded = false,
      onEnteringDone,
      removalAnimationMode,
    } = props;
    const outerRef = useRef<HTMLDivElement | null>(null);
    const innerRef = useRef<HTMLDivElement | null>(null);
    const bodyRef = useRef<HTMLDivElement | null>(null);
    const measuredHeightRef = useRef(0);
    const collapseCommittedRef = useRef(false);
    const [enterPhase, setEnterPhase] = useState<EnterPhase>(() =>
      isEntering && removalAnimationMode === null ? "initial" : "none",
    );

    const isCollapsing = removalAnimationMode !== null;
    const isSwipeReadExit = removalAnimationMode === "swipe-read";
    const durationMs = removalAnimationMode
      ? getArticleRemovalAnimationDuration(removalAnimationMode)
      : 0;
    const transitionMs = Math.max(durationMs, 180);

    useLayoutEffect(() => {
      if (!isEntering || isCollapsing) {
        setEnterPhase("none");
        return;
      }

      setEnterPhase((prev) => (prev === "none" ? "initial" : prev));
    }, [isCollapsing, isEntering]);

    useEffect(() => {
      if (enterPhase !== "initial") return;

      const body = bodyRef.current;
      if (body) {
        measuredHeightRef.current = body.scrollHeight;
      }

      const frameId = window.requestAnimationFrame(() => {
        setEnterPhase("animating");
      });
      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }, [enterPhase]);

    useEffect(() => {
      if (enterPhase !== "animating") return;

      const timerId = setTimeout(() => {
        setEnterPhase("done");
        onEnteringDone?.(articleKey);
      }, DASHBOARD_SHELL_HANDOFF_TOTAL_DONE_MS);

      return () => {
        clearTimeout(timerId);
      };
    }, [articleKey, enterPhase, onEnteringDone]);

    useEffect(() => {
      const node = bodyRef.current;
      if (!node) {
        return;
      }

      measuredHeightRef.current = node.scrollHeight;

      if (isCollapsing) {
        return;
      }

      const resizeObserver = new ResizeObserver(() => {
        measuredHeightRef.current = node.scrollHeight;
      });
      resizeObserver.observe(node);

      return () => {
        resizeObserver.disconnect();
      };
    }, [children, isCollapsing]);

    useLayoutEffect(() => {
      if (!isCollapsing) {
        collapseCommittedRef.current = false;
        const outer = outerRef.current;
        const inner = innerRef.current;
        if (outer) {
          outer.style.willChange = "";
        }
        if (inner) {
          inner.style.willChange = "";
        }
        return;
      }

      collapseCommittedRef.current = false;

      if (outerRef.current) {
        outerRef.current.style.willChange = "margin-bottom, opacity";
      }
      if (innerRef.current) {
        innerRef.current.style.willChange = "max-height, transform";
      }

      const collapseFrameId = requestAnimationFrame(() => {
        collapseCommittedRef.current = true;

        const outer = outerRef.current;
        const inner = innerRef.current;

        if (outer) {
          outer.style.marginBottom = `${-FEED_ROW_COLLAPSE_OFFSET_PX}px`;
          if (!isSwipeReadExit) {
            outer.style.opacity = "0";
          }
        }
        if (inner) {
          inner.style.maxHeight = `${FEED_ROW_COLLAPSE_FLOOR_PX}px`;
          inner.style.minHeight = `${FEED_ROW_COLLAPSE_FLOOR_PX}px`;
          if (isSwipeReadExit) {
            inner.style.transform = "translate3d(2.5rem, 0, 0)";
          }
        }
      });

      return () => {
        cancelAnimationFrame(collapseFrameId);
      };
    }, [isCollapsing, isSwipeReadExit]);

    const isCommitted = collapseCommittedRef.current;
    const measuredHeight = measuredHeightRef.current;
    const releasePhase: FeedRowReleasePhase = isCollapsing
      ? "collapsing"
      : "idle";
    const isReleaseCollapsing = isCollapsing && isCommitted;

    const isEnteringInitial = !isCollapsing && enterPhase === "initial";
    const isEnteringAnimating = !isCollapsing && enterPhase === "animating";
    const isEnteringActive = isEnteringInitial || isEnteringAnimating;
    const enteringSkeletonDescriptor =
      resolveEnteringSkeletonDescriptor(articleKey);

    const rowOpacity = isSwipeReadExit ? "1" : isReleaseCollapsing ? "0" : "1";
    const bodyOpacity = isEnteringInitial ? "0" : "1";
    const bodyTransition = isEnteringActive
      ? `opacity ${DASHBOARD_SHELL_HANDOFF_OPACITY_DURATION_MS}ms ease-out ${DASHBOARD_SHELL_HANDOFF_OPACITY_DELAY_MS}ms`
      : undefined;

    const innerMaxHeight = isCollapsing
      ? `${Math.max(
          isReleaseCollapsing ? FEED_ROW_COLLAPSE_FLOOR_PX : measuredHeight,
          FEED_ROW_COLLAPSE_FLOOR_PX,
        )}px`
      : undefined;

    return (
      <div
        className="overflow-visible"
        data-article-entering={isEnteringAnimating ? "true" : undefined}
        data-feed-row-animation={removalAnimationMode ?? "idle"}
        data-feed-row-layout={isCollapsing ? "releasing" : "none"}
        data-feed-row-state={releasePhase}
        data-scroll-restore-key={articleKey}
        ref={outerRef}
        style={{
          contain: isExpanded ? "style" : "layout style",
          marginBottom: isReleaseCollapsing
            ? -FEED_ROW_COLLAPSE_OFFSET_PX
            : hasTrailingGap
              ? FEED_ROW_GAP_PX
              : 0,
          opacity: rowOpacity,
          transition: isCollapsing
            ? `margin-bottom ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1), opacity ${Math.round(transitionMs * 0.65)}ms ease-out ${Math.round(transitionMs * 0.1)}ms`
            : "none",
        }}
      >
        <div
          className="relative min-w-0"
          ref={innerRef}
          style={{
            maxHeight: innerMaxHeight,
            minHeight: isReleaseCollapsing
              ? FEED_ROW_COLLAPSE_FLOOR_PX
              : undefined,
            overflow: isCollapsing ? "hidden" : "visible",
            pointerEvents: isCollapsing || isEnteringActive ? "none" : "auto",
            transform: isCollapsing
              ? isSwipeReadExit
                ? "translate3d(2.5rem, 0, 0)"
                : undefined
              : undefined,
            transition: isCollapsing
              ? `max-height ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1), transform ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1)`
              : undefined,
          }}
        >
          {isEnteringActive ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-xl"
              data-feed-row-enter-skeleton="true"
            >
              <FeedArticleCardSkeleton
                descriptor={enteringSkeletonDescriptor}
              />
            </div>
          ) : null}
          <div
            className="relative z-10 min-h-0"
            ref={bodyRef}
            style={{ opacity: bodyOpacity, transition: bodyTransition }}
          >
            {children}
          </div>
        </div>
      </div>
    );
  },
);

/**
 * Hashes an article key into a small deterministic integer for visual variety.
 * @param articleKey - The article key to hash.
 * @returns A deterministic integer derived from the article key.
 */
function hashArticleKey(articleKey: string): number {
  let hash = 0;

  for (const character of articleKey) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) | 0;
  }

  return hash;
}

/**
 * Chooses a stable skeleton descriptor for an entering article row.
 * @param articleKey - The article identity used to keep repeated renders visually stable.
 * @returns A deterministic feed article skeleton descriptor.
 */
function resolveEnteringSkeletonDescriptor(
  articleKey: string,
): FeedArticleSkeletonDescriptor {
  const descriptorIndex =
    Math.abs(hashArticleKey(articleKey)) % FEED_ARTICLE_SKELETONS.length;

  return FEED_ARTICLE_SKELETONS[descriptorIndex];
}
