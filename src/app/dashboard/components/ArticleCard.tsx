import {
  ArrowUpRight,
  CalendarDays,
  Circle,
  CircleCheck,
  Code,
  Globe,
  Mail,
  Share2,
  Star,
} from "lucide-react";
import { motion } from "motion/react";
import {
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { type Article, formatRelativeDate } from "@/lib";
import { normalizeArticleHtmlSpacing, toPlainText } from "@/lib/sanitize";

import { DASHBOARD_EVENTS } from "../constants";
import { type ArticleRemovalAnimationMode } from "../hooks/useArticleActions";
import { useArticleExpansion } from "../hooks/useArticleExpansion";
import { useArticleHeights } from "../hooks/useArticleHeights";
import { useFavicon } from "../hooks/useFavicon";
import { useSwipeToRead } from "../hooks/useSwipeToRead";
import { useSwipeToStar } from "../hooks/useSwipeToStar";
import {
  buildPreview,
  getArticleSourceLabel,
  getRichContentClass,
} from "../services/article-content";
import { setCachedFaviconIndex } from "../services/favicons";

interface ArticleCardProps {
  article: Article;
  articleKey: string;
  hasScrapedContent: boolean;
  isDark: boolean;
  isExpanded: boolean;
  isHydrating: boolean;
  isMobile: boolean;
  isUpdatingState: boolean;
  onExpandedSwipeRead: (article: Article) => void;
  onPrepareExpand?: (article: Article) => void;
  onSwipeRead?: (article: Article) => void;
  onToggle: (article: Article) => void;
  onToggleRead: (article: Article) => void;
  onToggleStarred: (article: Article) => void;
  removalAnimationMode?: ArticleRemovalAnimationMode | null;
  showFavicon: boolean;
  useRichFormatting: boolean;
}

const iconBtnCls =
  "inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors duration-200 ease-out hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

const iconLinkCls =
  "inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/40 transition-colors duration-200 ease-out hover:text-foreground";

const ARTICLE_BODY_COLLAPSE_TRANSITION = {
  duration: 0.16,
  ease: [0.4, 0, 0.6, 1] as const,
};
const ARTICLE_BODY_EXPAND_TRANSITION = {
  duration: 0.24,
  ease: [0.16, 1, 0.3, 1] as const,
};
const ARTICLE_SWIPE_TRANSITION = {
  damping: 34,
  mass: 0.7,
  stiffness: 420,
  type: "spring" as const,
};
const ARTICLE_CONTENT_TRANSITION = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1] as const,
};
const TAP_DRIFT_PX = 4;
const AFTER_SWIPE_BLOCK_MS = 350;
const COLLAPSED_ARTICLE_PREVIEW_CLASS_NAME =
  "line-clamp-1 font-sans text-[0.93rem]/6 tracking-[-0.01em] text-muted-foreground/85 antialiased";
const COLLAPSED_ARTICLE_PREVIEW_MEASURE_CLASS_NAME =
  "overflow-hidden whitespace-nowrap font-sans text-[0.93rem]/6 tracking-[-0.01em] text-muted-foreground/85 antialiased";
const COLLAPSED_ARTICLE_TITLE_CLASS_NAME =
  "line-clamp-2 max-h-12 overflow-hidden text-[0.96rem]/6 font-semibold";

/** Renders a swipeable article card with header-scoped gestures while expanded. */
export const ArticleCard = memo(function ArticleCard({
  article,
  articleKey,
  hasScrapedContent,
  isDark,
  isExpanded,
  isHydrating,
  isMobile,
  isUpdatingState,
  onExpandedSwipeRead,
  onPrepareExpand,
  onSwipeRead,
  onToggle,
  onToggleRead,
  onToggleStarred,
  removalAnimationMode = null,
  showFavicon,
  useRichFormatting,
}: ArticleCardProps) {
  const [isRawHtmlOpen, setIsRawHtmlOpen] = useState(false);
  const [isCopyLinkOpen, setIsCopyLinkOpen] = useState(false);
  const [isGradientTracked, setIsGradientTracked] = useState(isExpanded);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [supportsNativeShare] = useState(
    () =>
      typeof navigator !== "undefined" && typeof navigator.share === "function",
  );
  const isDevelopment = process.env.NODE_ENV === "development";

  const rawHtml = article.content || "";
  const {
    collapsedPreview,
    content,
    hasOverflow,
    normalizedHtml,
    plainContent,
    preview,
  } = useMemo(() => {
    const normalized = normalizeArticleHtmlSpacing(rawHtml);
    const plain = toPlainText(normalized).trim();
    const body = plain || "No description available";
    const { hasOverflow: ho, preview: p } = buildPreview(body);
    return {
      collapsedPreview: ho ? `${p}\u2026` : p,
      content: body,
      hasOverflow: ho,
      normalizedHtml: normalized,
      plainContent: plain,
      preview: p,
    };
  }, [rawHtml]);
  const hasReadableContent = plainContent.length > 0;

  const { expandTransitionDone, onBodyAnimationComplete, phase } =
    useArticleExpansion(isExpanded, isHydrating);

  const isDeExpandingRemoval =
    removalAnimationMode === "de-expanding" && !isExpanded;
  const showSkeleton = phase === "loading";
  const showFullContent =
    isDeExpandingRemoval ||
    phase === "collapsing" ||
    phase === "expanding" ||
    phase === "expanded";
  const shouldMeasureExpandedHeight =
    !expandTransitionDone && (isExpanded || showSkeleton || showFullContent);
  const visuallyExpanded =
    isDeExpandingRemoval ||
    phase === "collapsing" ||
    phase === "expanding" ||
    phase === "expanded";
  const suppressCollapsedReadDimming = removalAnimationMode === "de-expanding";

  const cardT = "220ms cubic-bezier(0.2, 0, 0, 1)" as const;

  const richContentClassName = getRichContentClass(isExpanded);
  const visibleRichContentClassName = getRichContentClass(visuallyExpanded);

  const { collapsedHeight, expandedHeight, fullContentRef, previewRef } =
    useArticleHeights(
      content,
      preview,
      richContentClassName,
      shouldMeasureExpandedHeight,
    );
  const expandedContentHeight = Math.max(expandedHeight, collapsedHeight);
  const shouldAnimateBodyHeight =
    !isDeExpandingRemoval &&
    hasOverflow &&
    collapsedHeight > 0 &&
    expandedContentHeight > 0;
  const resolvedBodyHeight = isDeExpandingRemoval
    ? "auto"
    : expandTransitionDone && visuallyExpanded
      ? "auto"
      : phase === "collapsed" || phase === "collapsing"
        ? collapsedHeight
        : expandedContentHeight;
  const bodyMotionTransition =
    phase === "collapsing"
      ? ARTICLE_BODY_COLLAPSE_TRANSITION
      : ARTICLE_BODY_EXPAND_TRANSITION;

  const {
    faviconCacheKey,
    faviconCandidates,
    faviconIndex,
    faviconTint,
    faviconUrl,
    setFaviconIndex,
  } = useFavicon({ fallbackUrl: article.link, primaryUrl: article.feedUrl });

  const pressStartPos = useRef<null | { x: number; y: number }>(null);
  const pressPointerIdRef = useRef<null | number>(null);
  const pressMovedRef = useRef(false);
  const afterSwipeRef = useRef(0);
  const rawHtmlTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const copyLinkInputRef = useRef<HTMLInputElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const headerZoneRef = useRef<HTMLDivElement | null>(null);
  const contentZoneRef = useRef<HTMLDivElement | null>(null);
  const interactionBlockUntilRef = useRef(0);
  const previousPhaseRef = useRef(phase);

  useEffect(() => {
    if (
      !shouldAnimateBodyHeight &&
      (phase === "collapsing" || phase === "expanding")
    ) {
      onBodyAnimationComplete();
    }
  }, [onBodyAnimationComplete, phase, shouldAnimateBodyHeight]);

  useEffect(() => {
    if (
      phase === "expanded" &&
      previousPhaseRef.current !== "expanded" &&
      articleRef.current
    ) {
      articleRef.current.dispatchEvent(
        new CustomEvent(DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED),
      );
    }

    previousPhaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (isExpanded) {
      setIsGradientTracked(true);
      return;
    }

    setIsGradientTracked(false);
  }, [isExpanded]);

  const isExpandedBodyTarget = useCallback(
    (target: EventTarget | null) =>
      Boolean(
        visuallyExpanded &&
        target instanceof Node &&
        contentZoneRef.current?.contains(target),
      ),
    [visuallyExpanded],
  );
  const isInteractiveControlTarget = useCallback(
    (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        return false;
      }

      return Boolean(
        target.closest(
          [
            "button",
            "a[href]",
            "input",
            "textarea",
            "select",
            "summary",
            '[contenteditable="true"]',
            '[role="menuitem"]',
          ].join(", "),
        ),
      );
    },
    [],
  );
  const shouldIgnoreSwipeTarget = useCallback((target: EventTarget | null) => {
    if (target instanceof Node && visuallyExpanded) {
      if (!headerZoneRef.current?.contains(target)) {
        return true;
      }
    }

    if (!(target instanceof Element)) {
      return false;
    }

    if (visuallyExpanded && contentZoneRef.current?.contains(target)) {
      return true;
    }

    const control = target.closest(
      'button, input, textarea, select, summary, [contenteditable="true"]',
    );
    if (control) return true;

    const link = target.closest("a");
    if (!link) return false;

    return !contentZoneRef.current?.contains(link);
  }, [visuallyExpanded]);

  const commitReadSwipe = useCallback(() => {
    afterSwipeRef.current = Date.now();
    if (isExpanded) {
      onExpandedSwipeRead(article);
      return;
    }
    if (onSwipeRead) {
      onSwipeRead(article);
      return;
    }
    onToggleRead(article);
  }, [article, isExpanded, onExpandedSwipeRead, onSwipeRead, onToggleRead]);
  const commitStarSwipe = useCallback(() => {
    afterSwipeRef.current = Date.now();
    onToggleStarred(article);
  }, [article, onToggleStarred]);

  const {
    containerRef: collapsedReadSwipeRef,
    swipeState: collapsedReadSwipeState,
  } = useSwipeToRead(
    commitReadSwipe,
    isUpdatingState || visuallyExpanded,
    shouldIgnoreSwipeTarget,
    "collapsed-article-surface",
  );
  const {
    containerRef: expandedReadSwipeRef,
    swipeState: expandedReadSwipeState,
  } = useSwipeToRead(
    commitReadSwipe,
    isUpdatingState || !visuallyExpanded || isMobile,
    shouldIgnoreSwipeTarget,
    "expanded-header-surface",
  );
  const {
    containerRef: collapsedStarSwipeRef,
    swipeState: collapsedStarSwipeState,
  } = useSwipeToStar(
    commitStarSwipe,
    isUpdatingState || visuallyExpanded,
    shouldIgnoreSwipeTarget,
    "collapsed-article-surface",
  );
  const {
    containerRef: expandedStarSwipeRef,
    swipeState: expandedStarSwipeState,
  } = useSwipeToStar(
    commitStarSwipe,
    isUpdatingState || !visuallyExpanded || isMobile,
    shouldIgnoreSwipeTarget,
    "expanded-header-surface",
  );
  const readSwipeState = visuallyExpanded
    ? expandedReadSwipeState
    : collapsedReadSwipeState;
  const starSwipeState = visuallyExpanded
    ? expandedStarSwipeState
    : collapsedStarSwipeState;
  const anySwiping = readSwipeState.swiping || starSwipeState.swiping;
  const swipeOffsetX = readSwipeState.offsetX + starSwipeState.offsetX;
  const articleSurfaceRef = useCallback(
    (el: HTMLElement | null) => {
      articleRef.current = el;
      collapsedReadSwipeRef.current = el;
      collapsedStarSwipeRef.current = el;
    },
    [collapsedReadSwipeRef, collapsedStarSwipeRef],
  );
  const headerSwipeZoneRef = useCallback(
    (el: HTMLDivElement | null) => {
      headerZoneRef.current = el;
      expandedReadSwipeRef.current = el;
      expandedStarSwipeRef.current = el;
    },
    [expandedReadSwipeRef, expandedStarSwipeRef],
  );

  const shouldBlockArticleInteraction = () =>
    Date.now() < interactionBlockUntilRef.current;

  const blockArticleInteractionTemporarily = () => {
    interactionBlockUntilRef.current = Date.now() + 200;
  };

  const makeOpenChangeHandler =
    (setter: React.Dispatch<React.SetStateAction<boolean>>) =>
    (open: boolean) => {
      setter(open);
      if (!open) blockArticleInteractionTemporarily();
    };

  const handleRawHtmlOpenChange = makeOpenChangeHandler(setIsRawHtmlOpen);
  const handleCopyLinkOpenChange = makeOpenChangeHandler(setIsCopyLinkOpen);
  const handleShareMenuOpenChange = makeOpenChangeHandler(setIsShareMenuOpen);
  const stopArticleInteractionPropagation = useCallback(
    (event: React.SyntheticEvent) => {
      event.stopPropagation();
    },
    [],
  );
  const articleActionControlProps = {
    onPointerDown: stopArticleInteractionPropagation,
    onPointerUp: stopArticleInteractionPropagation,
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (isExpandedBodyTarget(e.target) || isInteractiveControlTarget(e.target)) {
      return;
    }
    if (shouldBlockArticleInteraction()) {
      e.stopPropagation();
      return;
    }
    if (!isExpanded) {
      onPrepareExpand?.(article);
    }
    pressPointerIdRef.current = e.pointerId;
    pressMovedRef.current = false;
    pressStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (isExpandedBodyTarget(e.target) || isInteractiveControlTarget(e.target)) {
      return;
    }
    if (pressPointerIdRef.current !== e.pointerId) return;
    const start = pressStartPos.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > TAP_DRIFT_PX) pressMovedRef.current = true;
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLElement>) => {
    if (isExpandedBodyTarget(e.target) || isInteractiveControlTarget(e.target)) {
      return;
    }
    if (pressPointerIdRef.current !== e.pointerId) return;
    pressPointerIdRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLElement>) => {
    if (isExpandedBodyTarget(e.target) || isInteractiveControlTarget(e.target)) {
      return;
    }
    if (pressPointerIdRef.current !== e.pointerId) return;
    pressPointerIdRef.current = null;
    pressStartPos.current = null;
    pressMovedRef.current = false;
  };

  const toggleExpanded = (e: React.MouseEvent) => {
    if (isInteractiveControlTarget(e.target)) {
      pressPointerIdRef.current = null;
      pressStartPos.current = null;
      pressMovedRef.current = false;
      return;
    }
    if (shouldBlockArticleInteraction()) {
      e.stopPropagation();
      return;
    }
    if (Date.now() - afterSwipeRef.current < AFTER_SWIPE_BLOCK_MS) return;
    if (pressMovedRef.current) {
      pressStartPos.current = null;
      pressMovedRef.current = false;
      return;
    }
    const down = pressStartPos.current;
    if (down) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > TAP_DRIFT_PX) return;
    }
    pressStartPos.current = null;
    pressMovedRef.current = false;
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    // Pointer interactions already prime scroll restoration on pointerdown.
    // Re-capturing here can overwrite the original viewport position after the
    // browser auto-scrolls a partially visible card into focus.
    if (!isExpanded && down === null) {
      onPrepareExpand?.(article);
    }
    onToggle(article);
  };

  const stopExpandedContentPropagation = useCallback(
    (event: React.MouseEvent | React.PointerEvent) => {
      if (!visuallyExpanded) {
        return;
      }

      event.stopPropagation();
    },
    [visuallyExpanded],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (isInteractiveControlTarget(event.target)) {
      return;
    }
    if (shouldBlockArticleInteraction()) {
      event.stopPropagation();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!isExpanded) {
      onPrepareExpand?.(article);
    }
    onToggle(article);
  };

  const handleShare = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const shareUrl = article.link;
    if (!shareUrl) return;

    try {
      await navigator.share({
        text: article.title,
        title: article.title,
        url: shareUrl,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not open share dialog");
    }
  };

  const handleSelectRawHtml = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    selectRawHtml();
  };

  const selectRawHtml = () => {
    const textarea = rawHtmlTextAreaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
  };

  const shareUrl = article.link;
  const encodedShareUrl = encodeURIComponent(shareUrl || "");
  const encodedShareTitle = encodeURIComponent(article.title || "");

  const selectShareLink = () => {
    const input = copyLinkInputRef.current;
    if (!input) return;

    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
  };

  const handleSelectShareLink = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    selectShareLink();
  };

  useEffect(() => {
    if (!isCopyLinkOpen) return;

    const timer = window.setTimeout(() => {
      selectShareLink();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isCopyLinkOpen]);

  useEffect(() => {
    if (!isRawHtmlOpen) return;

    const timer = window.setTimeout(() => {
      selectRawHtml();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isRawHtmlOpen]);

  // Gradient coordinate measurement for split header/content overlays
  const [gradientCoords, setGradientCoords] = useState({
    ch: 0,
    cw: 0,
    cy: 0,
    hy: 0,
  });

  const measureGradient = useCallback(() => {
    const a = articleRef.current;
    const h = headerZoneRef.current;
    const c = contentZoneRef.current;
    if (!a || !h || !c) return;
    setGradientCoords({
      ch: a.offsetHeight,
      cw: a.offsetWidth,
      cy: c.offsetTop,
      hy: h.offsetTop,
    });
  }, []);

  useEffect(() => {
    if (!isGradientTracked) {
      return;
    }

    const a = articleRef.current;
    const h = headerZoneRef.current;
    const c = contentZoneRef.current;
    if (!a || !h || !c) return;
    measureGradient();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureGradient);
    resizeObserver?.observe(a);
    resizeObserver?.observe(h);
    resizeObserver?.observe(c);
    return () => {
      resizeObserver?.disconnect();
    };
  }, [isGradientTracked, measureGradient]);

  const { ch, cw, cy, hy } = gradientCoords;
  const gradientReady = isGradientTracked && cw > 0 && ch > 0;

  const headerGradientStyle: React.CSSProperties = gradientReady
    ? { backgroundPosition: `0px -${hy}px`, backgroundSize: `${cw}px ${ch}px` }
    : {};
  const contentGradientStyle: React.CSSProperties = gradientReady
    ? { backgroundPosition: `0px -${cy}px`, backgroundSize: `${cw}px ${ch}px` }
    : {};

  const gradientCls = `absolute inset-0 bg-gradient-to-br transition duration-1000 ${
    isDark
      ? "from-zinc-100/20 via-zinc-100/10 to-transparent mix-blend-overlay"
      : "from-zinc-900/20 via-zinc-900/10 to-transparent mix-blend-overlay"
  } opacity-0 group-hover:opacity-100`;

  const copyLinkInputBlock = (
    <div className="rounded-md border bg-muted/30 p-2">
      <Input
        aria-label="Article link"
        className="
          h-8 border-0 bg-transparent px-2 font-mono text-xs shadow-none
        "
        onClick={(event) => {
          event.stopPropagation();
        }}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        readOnly
        ref={copyLinkInputRef}
        value={shareUrl || ""}
      />
    </div>
  );

  const copyLinkSelectAction = (
    <div className="flex justify-end">
      <Button
        onClick={handleSelectShareLink}
        size="sm"
        type="button"
        variant="outline"
      >
        Select
      </Button>
    </div>
  );

  return (
    <div
      className={`
        relative
        ${visuallyExpanded ? "overflow-visible" : `overflow-hidden`}
        rounded-xl
      `}
      style={{ touchAction: "pan-y" }}
    >
      {/* Swipe-to-read / swipe-to-star background indicators */}
      <motion.div
        animate={{
          opacity: readSwipeState.swiping ? 1 : 0,
          scale: readSwipeState.committed ? 1 : 0.985,
        }}
        className={`
          pointer-events-none absolute inset-0 z-0 flex items-center rounded-xl
          transition-colors duration-150
          ${
            readSwipeState.committed ? "bg-emerald-500/25" : "bg-emerald-500/10"
          }
        `}
        initial={false}
        transition={ARTICLE_SWIPE_TRANSITION}
      >
        <div
          className="
            flex items-center gap-2 pl-4 text-emerald-600
            dark:text-emerald-400
          "
        >
          {article.isRead ? (
            <Circle
              className={`
                size-5 transition-transform duration-150
                ${
                  readSwipeState.committed ? "scale-110" : "scale-90 opacity-60"
                }
              `}
            />
          ) : (
            <CircleCheck
              className={`
                size-5 transition-transform duration-150
                ${
                  readSwipeState.committed ? "scale-110" : "scale-90 opacity-60"
                }
              `}
            />
          )}
          <motion.span
            animate={{
              opacity: readSwipeState.committed ? 1 : 0,
              x: readSwipeState.committed ? 0 : -4,
            }}
            className="text-xs font-medium"
            initial={false}
            transition={ARTICLE_SWIPE_TRANSITION}
          >
            {article.isRead ? "Mark unread" : "Mark read"}
          </motion.span>
        </div>
      </motion.div>
      <motion.div
        animate={{
          opacity: starSwipeState.swiping ? 1 : 0,
          scale: starSwipeState.committed ? 1 : 0.985,
        }}
        className={`
          pointer-events-none absolute inset-0 z-0 flex items-center justify-end
          rounded-xl transition-colors duration-150
          ${starSwipeState.committed ? "bg-amber-500/25" : "bg-amber-500/10"}
        `}
        initial={false}
        transition={ARTICLE_SWIPE_TRANSITION}
      >
        <div
          className="
            flex items-center gap-2 pr-4 text-amber-600
            dark:text-amber-400
          "
        >
          <motion.span
            animate={{
              opacity: starSwipeState.committed ? 1 : 0,
              x: starSwipeState.committed ? 0 : 4,
            }}
            className="text-xs font-medium"
            initial={false}
            transition={ARTICLE_SWIPE_TRANSITION}
          >
            {article.isStarred ? "Unstar" : "Star"}
          </motion.span>
          <Star
            className={`
              size-5 transition-transform duration-150
              ${
                starSwipeState.committed
                  ? "scale-110 fill-current"
                  : "scale-90 opacity-60"
              }
            `}
          />
        </div>
      </motion.div>
      <motion.article
        animate={{ x: swipeOffsetX }}
        aria-expanded={isExpanded}
        className={`
          article-swipe-surface group relative overflow-visible border
          border-border
          dark:shadow-2xl dark:shadow-zinc-900/50
          ${visuallyExpanded ? `rounded-t-[0.5rem] rounded-b-xl` : `rounded-xl`}
          ${
            article.isRead && !visuallyExpanded && !suppressCollapsedReadDimming
              ? `
                *:opacity-55 *:transition-opacity *:duration-200
                hover:*:opacity-100
              `
              : ""
          }
        `}
        data-article-key={articleKey}
        data-swipe-active={anySwiping ? "true" : "false"}
        data-swipe-direction={
          readSwipeState.swiping
            ? "read"
            : starSwipeState.swiping
              ? "star"
              : "idle"
        }
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => {
          setIsGradientTracked(true);
        }}
        onMouseLeave={() => {
          if (!isExpanded) {
            setIsGradientTracked(false);
          }
        }}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        ref={articleSurfaceRef}
        role="button"
        style={{
          cursor: visuallyExpanded ? "default" : "pointer",
          touchAction: "pan-y",
          transition: anySwiping
            ? "none"
            : [`border-radius ${cardT}`].filter(Boolean).join(", "),
          userSelect: visuallyExpanded ? "text" : "none",
          WebkitTouchCallout: visuallyExpanded ? "default" : "none",
          WebkitUserSelect: visuallyExpanded ? "text" : "none",
        }}
        tabIndex={0}
        transition={anySwiping ? { duration: 0 } : ARTICLE_SWIPE_TRANSITION}
      >
        {/* Header zone — sticky when expanded */}
        <div
          className={`
            relative
            ${
              visuallyExpanded
                ? `sticky top-0 z-50 rounded-t-xl bg-card/85 px-4 pt-4`
                : `rounded-t-xl bg-card/70 px-3 pt-3`
            }
          `}
          data-article-swipe-zone="header"
          ref={headerSwipeZoneRef}
          style={{
            touchAction: "pan-y",
            userSelect: "none",
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            ...(visuallyExpanded
              ? {
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                }
              : undefined),
          }}
        >
          <div
            className="
              pointer-events-none absolute inset-0 overflow-hidden rounded-t-xl
            "
          >
            <div className={gradientCls} style={headerGradientStyle} />
          </div>
          <div className="relative z-10 space-y-2">
            <div
              className="
                flex items-center gap-2 text-xs/5 tracking-normal
                text-muted-foreground/70 select-none
              "
            >
              <div className="
                flex shrink-0 items-center gap-2 whitespace-nowrap
              ">
                <CalendarDays className="size-3" />
                {formatRelativeDate(new Date(article.publicationDate))}
                <span
                  aria-hidden="true"
                  className="size-1 shrink-0 rounded-full bg-border/80"
                />
              </div>
              <div className="flex min-w-0 items-center gap-2">
                {showFavicon ? (
                  faviconUrl ? (
                    <img
                      alt=""
                      className="size-3 rounded-sm"
                      loading="lazy"
                      onError={() => {
                        setFaviconIndex((current) => {
                          const next = current + 1;
                          const resolved =
                            next < faviconCandidates.length ? next : -1;
                          setCachedFaviconIndex(faviconCacheKey, resolved);
                          return resolved;
                        });
                      }}
                      onLoad={() => {
                        setCachedFaviconIndex(faviconCacheKey, faviconIndex);
                      }}
                      referrerPolicy="no-referrer"
                      src={faviconUrl}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="
                        inline-flex size-3 shrink-0 items-center justify-center
                        rounded-full
                      "
                      style={{ backgroundColor: faviconTint.background }}
                    >
                      <Globe
                        className="size-2"
                        style={{ color: faviconTint.foreground }}
                      />
                    </span>
                  )
                ) : null}
                <span className="truncate">
                  {getArticleSourceLabel(article)}
                </span>
              </div>

              <div
                className={`
                  -mr-1 ml-auto flex shrink-0 items-center gap-1
                  transition-opacity duration-150
                  ${
                    visuallyExpanded || isMobile
                      ? `opacity-100`
                      : `
                        opacity-0
                        group-hover:opacity-100
                      `
                  }
                `}
              >
                <button
                  aria-label={
                    article.isRead ? "Mark as unread" : "Mark as read"
                  }
                  {...articleActionControlProps}
                  className={iconBtnCls}
                  disabled={isUpdatingState}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleRead(article);
                  }}
                  type="button"
                >
                  {article.isRead ? (
                    <CircleCheck
                      className="
                        size-3.5 text-emerald-500/70
                        dark:text-emerald-400/60
                      "
                    />
                  ) : (
                    <Circle className="size-3.5" />
                  )}
                </button>

                <button
                  aria-label={
                    article.isStarred ? "Remove star" : "Star article"
                  }
                  {...articleActionControlProps}
                  className={iconBtnCls}
                  disabled={isUpdatingState}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleStarred(article);
                  }}
                  type="button"
                >
                  <Star
                    className={`
                      size-3.5
                      ${
                        article.isStarred
                          ? `
                            fill-current text-amber-400/90
                            dark:text-amber-300/80
                          `
                          : ""
                      }
                    `}
                  />
                </button>

                {supportsNativeShare ? (
                  <button
                    aria-label="Share article"
                    {...articleActionControlProps}
                    className={iconBtnCls}
                    onClick={(event) => {
                      void handleShare(event);
                    }}
                    type="button"
                  >
                    <Share2 className="size-3.5" />
                  </button>
                ) : (
                  <DropdownMenu
                    onOpenChange={handleShareMenuOpenChange}
                    open={isShareMenuOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Share article options"
                        {...articleActionControlProps}
                        className={iconBtnCls}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        type="button"
                      >
                        <Share2 className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onClick={(event: React.MouseEvent) => {
                        event.stopPropagation();
                      }}
                    >
                      <DropdownMenuItem
                        disabled={!shareUrl}
                        onSelect={(event: Event) => {
                          event.preventDefault();
                          setIsShareMenuOpen(false);
                          setIsCopyLinkOpen(true);
                        }}
                      >
                        Copy link
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        asChild
                        onSelect={() => {
                          setIsShareMenuOpen(false);
                        }}
                      >
                        <a
                          href={`mailto:?subject=${encodedShareTitle}&body=${encodedShareUrl}`}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <Mail className="size-3.5" />
                          Email
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        asChild
                        onSelect={() => {
                          setIsShareMenuOpen(false);
                        }}
                      >
                        <a
                          href={`https://www.reddit.com/submit?url=${encodedShareUrl}&title=${encodedShareTitle}`}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Share to Reddit
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        asChild
                        onSelect={() => {
                          setIsShareMenuOpen(false);
                        }}
                      >
                        <a
                          href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`${article.title} ${shareUrl || ""}`.trim())}`}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Share to Bluesky
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {isDevelopment ? (
                  <button
                    aria-label="View raw article HTML"
                    {...articleActionControlProps}
                    className={iconBtnCls}
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsRawHtmlOpen(true);
                    }}
                    type="button"
                  >
                    <Code className="size-3.5" />
                  </button>
                ) : null}

                <a
                  aria-label="Open article"
                  {...articleActionControlProps}
                  className={iconLinkCls}
                  href={article.link}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ArrowUpRight className="size-3.5" />
                </a>
              </div>
            </div>

            <h3
              className={`
                font-sans tracking-[-0.015em] text-foreground antialiased
                select-none
                ${
                  visuallyExpanded
                    ? `text-[1.125rem] leading-[1.35] font-bold`
                    : COLLAPSED_ARTICLE_TITLE_CLASS_NAME
                }
              `}
            >
              {article.title}
            </h3>
          </div>
          {visuallyExpanded && (
            <div className="mt-3 border-t border-border/20" />
          )}
        </div>

        {/* Content zone */}
        <div
          className={`
            relative bg-card/70
            ${
              visuallyExpanded
                ? `rounded-b-xl px-4 pt-3 pb-4`
                : `rounded-b-xl px-3 pt-2 pb-3`
            }
          `}
          data-article-swipe-zone="content"
          onClick={stopExpandedContentPropagation}
          onMouseDown={stopExpandedContentPropagation}
          onPointerCancel={stopExpandedContentPropagation}
          onPointerDown={stopExpandedContentPropagation}
          onPointerMove={stopExpandedContentPropagation}
          onPointerUp={stopExpandedContentPropagation}
          ref={contentZoneRef}
        >
          <div
            className="
              pointer-events-none absolute inset-0 overflow-hidden rounded-b-xl
            "
          >
            <div className={gradientCls} style={contentGradientStyle} />
          </div>
          <div className="relative z-10">
            <motion.div
              animate={
                shouldAnimateBodyHeight
                  ? { height: resolvedBodyHeight }
                  : undefined
              }
              className={`
                article-swipe-body overflow-hidden
                ${visuallyExpanded ? `select-text` : ""}
              `}
              initial={false}
              onAnimationComplete={onBodyAnimationComplete}
              onClick={
                visuallyExpanded
                  ? (e) => {
                      // Expanded body interactions should never collapse the card.
                      e.stopPropagation();
                    }
                  : undefined
              }
              onMouseDown={
                visuallyExpanded
                  ? (event) => {
                      event.stopPropagation();
                    }
                  : undefined
              }
              onPointerDown={
                visuallyExpanded
                  ? (event) => {
                      event.stopPropagation();
                    }
                  : undefined
              }
              style={{
                // content-visibility: auto helps with off-screen collapsed cards
                // but must NOT be active while expanded — it creates a containment
                // boundary the compositor uses as a touch-action walk stop-point,
                // breaking swipe gestures on the article body.
                contentVisibility:
                  expandTransitionDone && !visuallyExpanded
                    ? "auto"
                    : "visible",
                cursor: visuallyExpanded ? "text" : undefined,
                height: shouldAnimateBodyHeight ? collapsedHeight : undefined,
                touchAction: "pan-y",
                userSelect: visuallyExpanded ? "text" : "none",
                WebkitTouchCallout: visuallyExpanded ? "default" : "none",
                WebkitUserSelect: visuallyExpanded ? "text" : "none",
              }}
              transition={bodyMotionTransition}
            >
              {showSkeleton ? (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2 py-1"
                  data-article-hydration-state="loading"
                  initial={{ opacity: 0, y: 6 }}
                  transition={ARTICLE_CONTENT_TRANSITION}
                >
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-[94%]" />
                  <Skeleton className="h-3 w-[88%]" />
                  <Skeleton className="h-3 w-[76%]" />
                </motion.div>
              ) : !showFullContent ? (
                <p
                  className={COLLAPSED_ARTICLE_PREVIEW_CLASS_NAME}
                  data-article-preview="true"
                >
                  {collapsedPreview}
                </p>
              ) : isExpanded && !hasScrapedContent && !hasReadableContent ? (
                <motion.p
                  animate={{ opacity: 1, y: 0 }}
                  className="
                    font-sans text-[0.93rem]/6 tracking-[-0.01em]
                    text-muted-foreground/75 antialiased
                  "
                  initial={{ opacity: 0, y: 8 }}
                  transition={ARTICLE_CONTENT_TRANSITION}
                >
                  Full article content unavailable. Open the original article to
                  read more.
                </motion.p>
              ) : useRichFormatting ? (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className={`
                    ${visibleRichContentClassName}
                    ${visuallyExpanded ? `cursor-text select-text` : ""}
                  `}
                  dangerouslySetInnerHTML={{ __html: normalizedHtml }}
                  initial={{ opacity: 0, y: 8 }}
                  style={{
                    contain: visuallyExpanded ? "none" : "layout style paint",
                    willChange: visuallyExpanded ? "auto" : "contents",
                  }}
                  transition={ARTICLE_CONTENT_TRANSITION}
                />
              ) : (
                <motion.p
                  animate={{ opacity: 1, y: 0 }}
                  className={`
                    font-sans tracking-[-0.01em] wrap-break-word
                    whitespace-pre-line antialiased
                    ${
                      visuallyExpanded
                        ? `
                          cursor-text text-[0.97rem]/7 text-foreground/85
                          select-text
                        `
                        : `text-[0.93rem]/6 text-muted-foreground/85`
                    }
                  `}
                  initial={{ opacity: 0, y: 8 }}
                  transition={ARTICLE_CONTENT_TRANSITION}
                >
                  {content}
                </motion.p>
              )}
            </motion.div>

            {/* Hidden measurement targets for height animation */}
            <div
              aria-hidden="true"
              className="pointer-events-none h-0 overflow-hidden opacity-0"
            >
              <p
                className={COLLAPSED_ARTICLE_PREVIEW_MEASURE_CLASS_NAME}
                data-article-preview-measure="true"
                ref={previewRef}
              >
                {`${preview}…`}
              </p>
            </div>
            {shouldMeasureExpandedHeight ? (
              <div
                aria-hidden="true"
                className="pointer-events-none h-0 overflow-hidden opacity-0"
                ref={fullContentRef}
              >
                {useRichFormatting ? (
                  <div
                    className={richContentClassName}
                    dangerouslySetInnerHTML={{ __html: normalizedHtml }}
                  />
                ) : (
                  <p
                    className="
                      font-sans text-[0.97rem]/7 tracking-[-0.01em]
                      wrap-break-word whitespace-pre-line text-foreground/85
                      antialiased
                    "
                  >
                    {content}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {isDevelopment ? (
          isMobile ? (
            <Drawer onOpenChange={handleRawHtmlOpenChange} open={isRawHtmlOpen}>
              <DrawerContent
                className="max-h-[85dvh]"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <DrawerHeader className="space-y-2 text-left">
                  <div
                    className="
                      flex w-full items-start justify-between gap-3 text-left
                    "
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <DrawerTitle>Raw Article HTML</DrawerTitle>
                      <DrawerDescription>
                        Development-only view of the current article content
                        payload.
                      </DrawerDescription>
                    </div>
                    <Button
                      onClick={handleSelectRawHtml}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Select
                    </Button>
                  </div>
                </DrawerHeader>
                <div className="px-4 pb-6">
                  <div className="rounded-md border bg-muted/40 p-3">
                    <textarea
                      aria-label="Raw article HTML"
                      className="
                        h-[60dvh] min-h-48 w-full resize-none border-0
                        bg-transparent p-0 font-mono text-xs/5
                        text-foreground/90 shadow-none outline-none
                      "
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                      onFocus={(event) => {
                        event.currentTarget.select();
                      }}
                      readOnly
                      ref={rawHtmlTextAreaRef}
                      value={normalizedHtml}
                    />
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          ) : (
            <Dialog onOpenChange={handleRawHtmlOpenChange} open={isRawHtmlOpen}>
              <DialogContent
                className="max-w-3xl"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <DialogHeader className="space-y-2 text-left">
                  <div
                    className="
                      flex w-full items-start justify-between gap-3 text-left
                    "
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <DialogTitle>Raw Article HTML</DialogTitle>
                      <DialogDescription>
                        Development-only view of the current article content
                        payload.
                      </DialogDescription>
                    </div>
                    <Button
                      onClick={handleSelectRawHtml}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Select
                    </Button>
                  </div>
                </DialogHeader>
                <div className="rounded-md border bg-muted/40 p-3">
                  <textarea
                    aria-label="Raw article HTML"
                    className="
                      h-[65vh] min-h-56 w-full resize-none border-0
                      bg-transparent p-0 font-mono text-xs/5 text-foreground/90
                      shadow-none outline-none
                    "
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    onFocus={(event) => {
                      event.currentTarget.select();
                    }}
                    readOnly
                    ref={rawHtmlTextAreaRef}
                    value={normalizedHtml}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )
        ) : null}

        {isMobile ? (
          <Drawer onOpenChange={handleCopyLinkOpenChange} open={isCopyLinkOpen}>
            <DrawerContent
              className="max-h-[45dvh]"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <DrawerHeader>
                <DrawerTitle>Copy Link</DrawerTitle>
                <DrawerDescription>
                  Link is selected automatically for direct copying.
                </DrawerDescription>
              </DrawerHeader>
              <div className="space-y-3 px-4 pb-6">
                {copyLinkInputBlock}
                {copyLinkSelectAction}
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <Dialog onOpenChange={handleCopyLinkOpenChange} open={isCopyLinkOpen}>
            <DialogContent
              className="max-w-md"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <DialogHeader>
                <DialogTitle>Copy Link</DialogTitle>
                <DialogDescription>
                  Link is selected automatically for direct copying.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {copyLinkInputBlock}
                {copyLinkSelectAction}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </motion.article>
    </div>
  );
});
