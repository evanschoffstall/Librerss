import { memo, useEffect, useLayoutEffect, useRef } from "react";

import { getArticleRemovalAnimationDuration } from "../../hooks/useArticleCollapseState";
import { FEED_ROW_COLLAPSE_FLOOR_PX, FEED_ROW_GAP_PX } from "./constants";
import { type FeedListRowProps } from "./FeedList.types";

type FeedRowReleasePhase = "collapsing" | "fading" | "idle";

const FEED_ROW_COLLAPSE_OFFSET_PX = FEED_ROW_COLLAPSE_FLOOR_PX;

export const FeedListRow = memo(function FeedListRow({
  articleKey,
  children,
  removalAnimationMode,
}: FeedListRowProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const measuredHeightRef = useRef(0);
  const collapseCommittedRef = useRef(false);

  const isCollapsing = removalAnimationMode !== null;
  const isSwipeReadExit = removalAnimationMode === "swipe-read";
  const durationMs = removalAnimationMode
    ? getArticleRemovalAnimationDuration(removalAnimationMode)
    : 0;
  const transitionMs = Math.max(durationMs, 180);

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
  const releasePhase: FeedRowReleasePhase = isCollapsing ? "collapsing" : "idle";
  const isReleaseCollapsing = isCollapsing && isCommitted;
  const rowOpacity = isSwipeReadExit ? 1 : isReleaseCollapsing ? 0 : 1;

  return (
    <div
      className="overflow-visible"
      data-feed-row-animation={removalAnimationMode ?? "idle"}
      data-feed-row-layout={isCollapsing ? "releasing" : "none"}
      data-feed-row-state={releasePhase}
      data-scroll-restore-key={articleKey}
      ref={outerRef}
      style={{
        contain: "layout style",
        marginBottom: isReleaseCollapsing
          ? -FEED_ROW_COLLAPSE_OFFSET_PX
          : FEED_ROW_GAP_PX,
        opacity: rowOpacity,
        transition: isCollapsing
          ? `margin-bottom ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1), opacity ${Math.round(transitionMs * 0.65)}ms ease-out ${Math.round(transitionMs * 0.1)}ms`
          : "none",
      }}
    >
      <div
        className="min-w-0"
        ref={innerRef}
        style={{
          maxHeight: isCollapsing
            ? Math.max(
                isReleaseCollapsing
                  ? FEED_ROW_COLLAPSE_FLOOR_PX
                  : measuredHeight,
                FEED_ROW_COLLAPSE_FLOOR_PX,
              )
            : undefined,
          minHeight: isReleaseCollapsing
            ? FEED_ROW_COLLAPSE_FLOOR_PX
            : undefined,
          overflow: isCollapsing ? "hidden" : "visible",
          pointerEvents: isCollapsing ? "none" : "auto",
          transform: isSwipeReadExit
            ? isCollapsing
              ? "translate3d(2.5rem, 0, 0)"
              : "translate3d(0, 0, 0)"
            : "translate3d(0, 0, 0)",
          transition: isCollapsing
            ? `max-height ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1), transform ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1)`
            : `transform ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1)`,
        }}
      >
        <div className="min-h-0" ref={bodyRef}>
          {children}
        </div>
      </div>
    </div>
  );
});