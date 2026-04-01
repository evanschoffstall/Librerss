import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";

import { getArticleRemovalAnimationDuration } from "../../hooks/useArticleCollapseState";
import { FEED_ROW_COLLAPSE_FLOOR_PX, FEED_ROW_GAP_PX } from "./constants";
import { type FeedListRowProps } from "./FeedList.types";

/**
 * The three phases of the entrance animation:
 * - "none": article is not entering (idle post-load)
 * - "initial": maxHeight=0/opacity=0 painted; measuring content height
 * - "animating": CSS transition running (expanding height + fading in)
 * - "done": settled; inline override styles cleared; onEnteringDone fired
 */
type EnterPhase = "animating" | "done" | "initial" | "none";
type FeedRowReleasePhase = "collapsing" | "fading" | "idle";

/** Duration of the height-expansion part of the entrance animation (ms). */
const ARTICLE_ENTER_HEIGHT_DURATION_MS = 400;
/** Opacity fade-in duration (ms). */
const ARTICLE_ENTER_OPACITY_DURATION_MS = 260;
/** Opacity fade-in delay so it starts the height is visibly growing (ms). */
const ARTICLE_ENTER_OPACITY_DELAY_MS = 90;
/** Total time until cleanup fires (height anim + small buffer). */
const ARTICLE_ENTER_TOTAL_DONE_MS =
  ARTICLE_ENTER_HEIGHT_DURATION_MS + ARTICLE_ENTER_OPACITY_DELAY_MS + 20;
/** Ease used for the height expansion — a smooth spring-like deceleration. */
const ARTICLE_ENTER_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const FEED_ROW_COLLAPSE_OFFSET_PX = FEED_ROW_COLLAPSE_FLOOR_PX;

export const FeedListRow = memo(function FeedListRow({
  articleKey,
  children,
  hasTrailingGap,
  isEntering = false,
  onEnteringDone,
  removalAnimationMode,
}: FeedListRowProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const measuredHeightRef = useRef(0);
  const collapseCommittedRef = useRef(false);
  const [enterPhase, setEnterPhase] = useState<EnterPhase>(() =>
    isEntering ? "initial" : "none",
  );

  const isCollapsing = removalAnimationMode !== null;
  const isSwipeReadExit = removalAnimationMode === "swipe-read";
  const durationMs = removalAnimationMode
    ? getArticleRemovalAnimationDuration(removalAnimationMode)
    : 0;
  const transitionMs = Math.max(durationMs, 180);

  // ── Entering: kick off "initial" phase when isEntering prop becomes true ──
  // Only transition from "none" → "initial" so we don't restart a mid-flight anim.
  useLayoutEffect(() => {
    if (!isEntering || isCollapsing) {
      if (!isEntering) {
        setEnterPhase("none");
      }
      return;
    }

    setEnterPhase((prev) => (prev === "none" ? "initial" : prev));
  }, [isCollapsing, isEntering]);

  // ── Entering "initial": measure content height, then schedule anim frame ──
  useEffect(() => {
    if (enterPhase !== "initial") return;

    // body.scrollHeight gives the natural content height even when the inner
    // div has maxHeight:0 applied by the JSX styles below — the overflow clip
    // on the inner div does not affect the body's own scrollHeight.
    const body = bodyRef.current;
    if (body) {
      measuredHeightRef.current = body.scrollHeight;
    }

    const frameId = requestAnimationFrame(() => {
      setEnterPhase("animating");
    });
    return () => { cancelAnimationFrame(frameId); };
  }, [enterPhase]);

  // ── Entering "animating": set data-article-entering flag + call done handler ──
  useEffect(() => {
    if (enterPhase !== "animating") return;

    const outer = outerRef.current;
    if (outer) {
      // Marks this article as still-animating for "mark visible as read" exclusion.
      outer.dataset.articleEntering = "true";
    }

    const timerId = setTimeout(() => {
      if (outer) {
        delete outer.dataset.articleEntering;
      }
      setEnterPhase("done");
      onEnteringDone?.(articleKey);
    }, ARTICLE_ENTER_TOTAL_DONE_MS);

    return () => {
      clearTimeout(timerId);
      if (outer) {
        delete outer.dataset.articleEntering;
      }
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
  const releasePhase: FeedRowReleasePhase = isCollapsing ? "collapsing" : "idle";
  const isReleaseCollapsing = isCollapsing && isCommitted;

  // Entering-phase derived helpers (collapse always wins if both are somehow true)
  const isEnteringInitial = !isCollapsing && enterPhase === "initial";
  const isEnteringAnimating = !isCollapsing && enterPhase === "animating";
  const isEnteringActive = isEnteringInitial || isEnteringAnimating;

  // Opacity: entering overrides collapse unless collapsing takes over
  const rowOpacity = isEnteringInitial
    ? 0
    : isSwipeReadExit
      ? 1
      : isReleaseCollapsing
        ? 0
        : 1;

  // Inner maxHeight: entering wins unless collapsing
  const innerMaxHeight = isCollapsing
    ? Math.max(
        isReleaseCollapsing ? FEED_ROW_COLLAPSE_FLOOR_PX : measuredHeight,
        FEED_ROW_COLLAPSE_FLOOR_PX,
      )
    : isEnteringInitial
      ? 0
      : isEnteringAnimating
        // Extra 32px buffer absorbs padding/border rounding without visible clipping.
        ? measuredHeight + 32
        : undefined;

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
          : hasTrailingGap
            ? FEED_ROW_GAP_PX
            : 0,
        opacity: rowOpacity,
        transition: isCollapsing
          ? `margin-bottom ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1), opacity ${Math.round(transitionMs * 0.65)}ms ease-out ${Math.round(transitionMs * 0.1)}ms`
          : isEnteringActive
            ? `opacity ${ARTICLE_ENTER_OPACITY_DURATION_MS}ms ease-out ${ARTICLE_ENTER_OPACITY_DELAY_MS}ms`
            : "none",
      }}
    >
      <div
        className="min-w-0"
        ref={innerRef}
        style={{
          maxHeight: innerMaxHeight,
          minHeight: isReleaseCollapsing
            ? FEED_ROW_COLLAPSE_FLOOR_PX
            : undefined,
          overflow: isCollapsing || isEnteringActive ? "hidden" : "visible",
          pointerEvents: isCollapsing || isEnteringActive ? "none" : "auto",
          transform: isCollapsing
            ? isSwipeReadExit
              ? "translate3d(2.5rem, 0, 0)"
              : undefined
            : undefined,
          transition: isCollapsing
            ? `max-height ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1), transform ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1)`
            : isEnteringActive
              ? `max-height ${ARTICLE_ENTER_HEIGHT_DURATION_MS}ms ${ARTICLE_ENTER_EASE}`
              : undefined,
        }}
      >
        <div className="min-h-0" ref={bodyRef}>
          {children}
        </div>
      </div>
    </div>
  );
});