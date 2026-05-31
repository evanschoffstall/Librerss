import { Circle, CircleCheck, Star } from "lucide-react";
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

import type { Article } from "@/lib/core";

import { ArticleCardContent } from "@/app/dashboard/components/article-view/ArticleCardContent";
import { ArticleCardDialogs } from "@/app/dashboard/components/article-view/ArticleCardDialogs";
import { ArticleCardHeader } from "@/app/dashboard/components/article-view/ArticleCardHeader";
import {
  SWIPE_COMMIT_SLIDE_MS,
  SWIPE_RELEASE_MS,
  SWIPE_THRESHOLD,
  useArticleExpansion,
  useSwipeGesture,
} from "@/app/dashboard/components/article-view/hooks";
import { useFaviconState } from "@/app/dashboard/components/favicon";
import { type ArticleRemovalAnimationMode } from "@/app/dashboard/display-types";
import {
  buildPreview,
  getRichContentClass,
} from "@/app/dashboard/services/article";
import { DASHBOARD_EVENTS } from "@/app/dashboard/services/dashboard-constants";
import { type DashboardArticleViewMode } from "@/app/dashboard/services/dashboard-view-mode";
import { Skeleton } from "@/components/ui/skeleton";
import { sanitizeArticleHtml, toPlainText } from "@/lib/sanitize";

/**
 * Describes the options for apply read swipe action.
 */
interface ApplyReadSwipeActionOptions {
  article: Article;
  isExpanded: boolean;
  onExpandedSwipeRead: (article: Article) => void;
  onSwipeRead?: ((article: Article) => void) | undefined;
  onToggleRead: (article: Article) => void;
}
/**
 * Describes the props for the article card component.
 */
interface ArticleCardProps {
  article: Article;
  articleKey: string;
  articleViewMode?: DashboardArticleViewMode;
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

/**
 * Process the apply read swipe action.
 * @param options - The options used to process the apply read swipe action.
 */
export function applyReadSwipeAction(options: ApplyReadSwipeActionOptions) {
  const {
    article,
    isExpanded,
    onExpandedSwipeRead,
    onSwipeRead,
    onToggleRead,
  } = options;
  if (isExpanded) {
    onExpandedSwipeRead(article);
    return;
  }

  if (onSwipeRead) {
    onSwipeRead(article);
    return;
  }

  onToggleRead(article);
}

const iconBtnCls =
  "inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

const iconLinkCls =
  "inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/40 hover:text-foreground";
const TAP_DRIFT_PX = 4;
const AFTER_SWIPE_BLOCK_MS = 350;
const COLLAPSED_ARTICLE_PREVIEW_CLASS_NAME =
  "line-clamp-1 font-sans text-[0.93rem]/6 tracking-[-0.01em] text-muted-foreground/85 antialiased";
const COMPACT_COLLAPSED_ARTICLE_PREVIEW_CLASS_NAME =
  "line-clamp-1 font-sans text-[0.88rem]/5 tracking-[-0.01em] text-muted-foreground/80 antialiased";
const COLLAPSED_ARTICLE_TITLE_CLASS_NAME =
  "line-clamp-2 max-h-12 overflow-hidden text-[0.96rem]/6 font-semibold";
const COMPACT_COLLAPSED_ARTICLE_TITLE_CLASS_NAME =
  "line-clamp-1 overflow-hidden text-[0.95rem]/5 font-semibold";
const ARTICLE_SURFACE_EASING = "cubic-bezier(0.25, 1, 0.5, 1)";
const COLLAPSED_ARTICLE_BODY_HEIGHT_PX = 24;
const COMPACT_COLLAPSED_ARTICLE_BODY_HEIGHT_PX = 20;

/** Renders a swipeable article card with header-scoped gestures while expanded. */
export const ArticleCard = memo(
  /**
   * Render the article card component.
   * @param props - The component props.
   * @returns The rendered article card component.
   */
  function ArticleCard(props: ArticleCardProps) {
    const {
      article,
      articleKey,
      articleViewMode = "card",
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
    } = props;
    const [isRawHtmlOpen, setIsRawHtmlOpen] = useState(false);
    const [isCopyLinkOpen, setIsCopyLinkOpen] = useState(false);
    const isGradientTrackedRef = useRef(isExpanded);
    const [isGradientTracked, setIsGradientTracked] = useState(isExpanded);
    const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
    const [supportsNativeShare] = useState(
      () =>
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function",
    );
    const isDevelopment = process.env.NODE_ENV === "development";

    const rawHtml = article.content || "";
    const { collapsedPreview, content, normalizedHtml, plainContent } =
      useMemo(() => {
        const normalized = sanitizeArticleHtml(rawHtml);
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

    const { phase } = useArticleExpansion(isExpanded, isHydrating);

    const isDeExpandingRemoval =
      removalAnimationMode === "de-expanding" && !isExpanded;
    const showSkeleton = phase === "loading";
    const showFullContent =
      isDeExpandingRemoval ||
      phase === "collapsing" ||
      phase === "expanding" ||
      phase === "expanded";
    const expandedBodyOpen =
      isDeExpandingRemoval ||
      phase === "loading" ||
      phase === "expanding" ||
      phase === "expanded";
    const collapsedPreviewOpen = !expandedBodyOpen && !showSkeleton;
    const visuallyExpanded =
      isDeExpandingRemoval ||
      phase === "loading" ||
      phase === "collapsing" ||
      phase === "expanding" ||
      phase === "expanded";
    const suppressCollapsedReadDimming =
      removalAnimationMode === "de-expanding";
    const collapsedArticleTitleClassName =
      articleViewMode === "compact"
        ? COMPACT_COLLAPSED_ARTICLE_TITLE_CLASS_NAME
        : COLLAPSED_ARTICLE_TITLE_CLASS_NAME;
    const collapsedArticlePreviewClassName =
      articleViewMode === "compact"
        ? COMPACT_COLLAPSED_ARTICLE_PREVIEW_CLASS_NAME
        : COLLAPSED_ARTICLE_PREVIEW_CLASS_NAME;
    const collapsedBodyHeightPx =
      articleViewMode === "compact"
        ? COMPACT_COLLAPSED_ARTICLE_BODY_HEIGHT_PX
        : COLLAPSED_ARTICLE_BODY_HEIGHT_PX;

    const cardT = `180ms ${ARTICLE_SURFACE_EASING}` as const;
    const bodyTransitionMs = phase === "collapsing" ? 240 : 280;

    const visibleRichContentClassName = getRichContentClass(visuallyExpanded);

    const {
      faviconCacheKey,
      faviconCandidates,
      faviconIndex,
      faviconTint,
      faviconUrl,
      setFaviconIndex,
    } = useFaviconState({
      fallbackUrl: article.link,
      primaryUrl: article.feedUrl,
    });

    const pressStartPos = useRef<null | { x: number; y: number }>(null);
    const pressPointerIdRef = useRef<null | number>(null);
    const pressMovedRef = useRef(false);
    const ignoreNextClickRef = useRef(false);
    const afterSwipeRef = useRef(0);
    const rawHtmlTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
    const copyLinkInputRef = useRef<HTMLInputElement | null>(null);
    const articleRef = useRef<HTMLElement | null>(null);
    const headerZoneRef = useRef<HTMLDivElement | null>(null);
    const contentZoneRef = useRef<HTMLDivElement | null>(null);
    const bodyMeasureRef = useRef<HTMLDivElement | null>(null);
    const headerGradientOverlayRef = useRef<HTMLDivElement | null>(null);
    const contentGradientOverlayRef = useRef<HTMLDivElement | null>(null);
    const interactionBlockUntilRef = useRef(0);
    const previousPhaseRef = useRef(phase);
    const [expandedBodyHeight, setExpandedBodyHeight] = useState(
      collapsedBodyHeightPx,
    );

    useEffect(() => {
      if (
        phase === "expanded" &&
        previousPhaseRef.current !== "expanded" &&
        articleRef.current
      ) {
        articleRef.current.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED, {
            bubbles: true,
          }),
        );
      }

      if (
        phase === "collapsed" &&
        previousPhaseRef.current === "collapsing" &&
        articleRef.current
      ) {
        articleRef.current.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.ARTICLE_COLLAPSE_SETTLED, {
            bubbles: true,
          }),
        );
      }

      previousPhaseRef.current = phase;
    }, [phase]);

    useEffect(() => {
      isGradientTrackedRef.current = isExpanded;
      setIsGradientTracked(isExpanded);
    }, [isExpanded]);

    useEffect(() => {
      const node = bodyMeasureRef.current;
      if (!node) {
        return;
      }

      /**
       * Update the height.
       */
      const updateHeight = () => {
        setExpandedBodyHeight(
          Math.max(node.scrollHeight, collapsedBodyHeightPx),
        );
      };

      updateHeight();

      const resizeObserver =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              updateHeight();
            });
      resizeObserver?.observe(node);

      return () => {
        resizeObserver?.disconnect();
      };
    }, [collapsedBodyHeightPx, isExpanded, normalizedHtml, useRichFormatting]);

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
    const hasActiveExpandedTextSelection = useCallback(() => {
      const selection = window.getSelection();
      if (!selection || selection.toString().length === 0) {
        return false;
      }

      const { anchorNode, focusNode } = selection;

      return (
        (anchorNode instanceof Node &&
          (contentZoneRef.current?.contains(anchorNode) ?? false)) ||
        (focusNode instanceof Node &&
          (contentZoneRef.current?.contains(focusNode) ?? false))
      );
    }, []);
    const shouldIgnoreSwipeTarget = useCallback(
      (target: EventTarget | null) => {
        if (!(target instanceof Element)) {
          return false;
        }

        const control = target.closest(
          'button, input, textarea, select, summary, [contenteditable="true"]',
        );
        if (control) return true;

        const link = target.closest("a");
        if (!link) return false;

        return !contentZoneRef.current?.contains(link);
      },
      [],
    );

    const commitReadSwipe = useCallback(() => {
      afterSwipeRef.current = Date.now();
      applyReadSwipeAction({
        article,
        isExpanded,
        onExpandedSwipeRead,
        onSwipeRead,
        onToggleRead,
      });
    }, [article, isExpanded, onExpandedSwipeRead, onSwipeRead, onToggleRead]);
    const commitStarSwipe = useCallback(() => {
      afterSwipeRef.current = Date.now();
      onToggleStarred(article);
    }, [article, onToggleStarred]);

    const {
      containerRef: collapsedReadSwipeRef,
      swipeState: collapsedReadSwipeState,
    } = useSwipeGesture(
      "right",
      commitReadSwipe,
      isUpdatingState || visuallyExpanded,
      shouldIgnoreSwipeTarget,
      "collapsed-article-surface",
    );
    const {
      containerRef: expandedReadSwipeRef,
      swipeState: expandedReadSwipeState,
    } = useSwipeGesture(
      "right",
      commitReadSwipe,
      isUpdatingState || !visuallyExpanded,
      shouldIgnoreSwipeTarget,
      "expanded-article-surface",
    );
    const {
      containerRef: collapsedStarSwipeRef,
      swipeState: collapsedStarSwipeState,
    } = useSwipeGesture(
      "left",
      commitStarSwipe,
      isUpdatingState || visuallyExpanded,
      shouldIgnoreSwipeTarget,
      "collapsed-article-surface",
    );
    const {
      containerRef: expandedStarSwipeRef,
      swipeState: expandedStarSwipeState,
    } = useSwipeGesture(
      "left",
      commitStarSwipe,
      isUpdatingState || !visuallyExpanded,
      shouldIgnoreSwipeTarget,
      "expanded-article-surface",
    );
    const readSwipeState = visuallyExpanded
      ? expandedReadSwipeState
      : collapsedReadSwipeState;
    const starSwipeState = visuallyExpanded
      ? expandedStarSwipeState
      : collapsedStarSwipeState;
    const readActive = readSwipeState.phase !== "idle";
    const starActive = starSwipeState.phase !== "idle";
    const anyActive = readActive || starActive;
    // True once the user has dragged past the commit threshold, whether or not
    // the finger is still down. This drives the "committed" visual state
    // (colour change, icon swap, label reveal) while swiping so feedback is
    // immediate rather than deferred to the post-release animation.
    const readSwipeAtThreshold =
      readSwipeState.committed || readSwipeState.progress >= SWIPE_THRESHOLD;
    const starSwipeAtThreshold =
      starSwipeState.committed || starSwipeState.progress >= SWIPE_THRESHOLD;
    const isActivelySwiping =
      readSwipeState.phase === "swiping" || starSwipeState.phase === "swiping";
    const isSwipeAnimating =
      readSwipeState.phase === "releasing" ||
      readSwipeState.phase === "committing" ||
      starSwipeState.phase === "releasing" ||
      starSwipeState.phase === "committing";
    const swipeOffsetX = readSwipeState.offsetX + starSwipeState.offsetX;
    const swipeTransitionMs =
      readSwipeState.phase === "committing" ||
      starSwipeState.phase === "committing"
        ? SWIPE_COMMIT_SLIDE_MS
        : SWIPE_RELEASE_MS;
    const articleSurfaceRef = useCallback(
      (el: HTMLElement | null) => {
        articleRef.current = el;
        collapsedReadSwipeRef.current = el;
        collapsedStarSwipeRef.current = el;
        expandedReadSwipeRef.current = el;
        expandedStarSwipeRef.current = el;
      },
      [
        collapsedReadSwipeRef,
        collapsedStarSwipeRef,
        expandedReadSwipeRef,
        expandedStarSwipeRef,
      ],
    );
    const headerSwipeZoneRef = useCallback((el: HTMLDivElement | null) => {
      headerZoneRef.current = el;
    }, []);

    /**
     * Return whether should block article interaction.
     * @returns Whether should block article interaction.
     */
    const shouldBlockArticleInteraction = () =>
      Date.now() < interactionBlockUntilRef.current;

    /**
     * Process the block article interaction temporarily.
     */
    const blockArticleInteractionTemporarily = () => {
      interactionBlockUntilRef.current = Date.now() + 200;
    };

    /**
     * Process the make open change handler.
     * @param setter - The setter.
     * @returns The make open change handler.
     */
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

    /**
     * Initiate press tracking on pointer-down when the target is not an interactive control.
     * @param e - The pointer event.
     */
    const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
      if (
        isExpandedBodyTarget(e.target) ||
        isInteractiveControlTarget(e.target)
      ) {
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

    /**
     * Track pointer movement to distinguish taps from drags during press tracking.
     * @param e - The pointer event.
     */
    const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
      if (shouldIgnorePressPointerTarget(e.target)) {
        return;
      }
      if (pressPointerIdRef.current !== e.pointerId) return;
      const start = pressStartPos.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > TAP_DRIFT_PX) pressMovedRef.current = true;
    };

    /**
     * Clear the active pointer ID when the pointer is lifted.
     * @param e - The pointer event.
     */
    const handlePointerEnd = (e: React.PointerEvent<HTMLElement>) => {
      if (shouldIgnorePressPointerTarget(e.target)) {
        return;
      }
      if (pressPointerIdRef.current !== e.pointerId) return;
      pressPointerIdRef.current = null;
    };

    /**
     * Reset press tracking state when the pointer event is cancelled by the browser.
     * @param e - The pointer event.
     */
    const handlePointerCancel = (e: React.PointerEvent<HTMLElement>) => {
      if (shouldIgnorePressPointerTarget(e.target)) {
        return;
      }
      if (pressPointerIdRef.current !== e.pointerId) return;
      resetPressPointerState();
    };

    /**
     * Process the reset press pointer state.
     */
    function resetPressPointerState() {
      pressPointerIdRef.current = null;
      pressStartPos.current = null;
      pressMovedRef.current = false;
    }

    /**
     * Return whether should ignore press pointer target.
     * @param target - The target.
     * @returns Whether should ignore press pointer target.
     */
    function shouldIgnorePressPointerTarget(target: EventTarget | null) {
      return isExpandedBodyTarget(target) || isInteractiveControlTarget(target);
    }

    /**
     * Toggle article expansion on click, suppressing the event when the click follows a swipe or targets a control.
     * @param e - The mouse event.
     */
    const toggleExpanded = (e: React.MouseEvent) => {
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
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
      if (isExpandedBodyTarget(e.target) && hasActiveExpandedTextSelection()) {
        return;
      }
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

    /**
     * Process the handle key down.
     * @param event - The event.
     */
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      if (isInteractiveControlTarget(event.target)) {
        return;
      }
      if (shouldBlockArticleInteraction()) {
        event.stopPropagation();
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      ignoreNextClickRef.current = true;
      event.preventDefault();
      if (!isExpanded) {
        onPrepareExpand?.(article);
      }
      onToggle(article);
    };

    /**
     * Process the handle share.
     * @param event - The event.
     */
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
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        toast.error("Could not open share dialog");
      }
    };

    /**
     * Process the handle select raw html.
     * @param event - The event.
     */
    const handleSelectRawHtml = (
      event: React.MouseEvent<HTMLButtonElement>,
    ) => {
      event.stopPropagation();
      event.preventDefault();
      selectRawHtml();
    };

    /**
     * Process the select raw html.
     */
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

    /**
     * Process the select share link.
     */
    const selectShareLink = () => {
      const input = copyLinkInputRef.current;
      if (!input) return;

      input.focus();
      input.select();
      input.setSelectionRange(0, input.value.length);
    };

    /**
     * Process the handle select share link.
     * @param event - The event.
     */
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

    // Gradient coordinate measurement — writes directly to DOM to avoid
    // re-render on every ResizeObserver callback during hover.
    const applyGradientStyles = useCallback(() => {
      const a = articleRef.current;
      const h = headerZoneRef.current;
      const c = contentZoneRef.current;
      if (!a || !h || !c) return;
      const ch = a.offsetHeight;
      const cw = a.offsetWidth;
      if (cw <= 0 || ch <= 0) return;
      const size = `${cw}px ${ch}px`;
      const hel = headerGradientOverlayRef.current;
      if (hel) {
        hel.style.backgroundPosition = `0px -${h.offsetTop}px`;
        hel.style.backgroundSize = size;
      }
      const cel = contentGradientOverlayRef.current;
      if (cel) {
        cel.style.backgroundPosition = `0px -${c.offsetTop}px`;
        cel.style.backgroundSize = size;
      }
    }, []);

    useEffect(() => {
      if (!isGradientTracked) {
        return;
      }

      const a = articleRef.current;
      const h = headerZoneRef.current;
      const c = contentZoneRef.current;
      if (!a || !h || !c) return;
      applyGradientStyles();
      const resizeObserver =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(applyGradientStyles);
      resizeObserver?.observe(a);
      resizeObserver?.observe(h);
      resizeObserver?.observe(c);
      return () => {
        resizeObserver?.disconnect();
      };
    }, [isGradientTracked, applyGradientStyles]);

    const gradientCls = `absolute inset-0 bg-gradient-to-br transition-opacity duration-1000 ${
      isDark
        ? "from-zinc-100/20 via-zinc-100/10 to-transparent mix-blend-overlay"
        : "from-zinc-900/20 via-zinc-900/10 to-transparent mix-blend-overlay"
    } opacity-0 group-hover:opacity-100`;

    const resolvedBodyHeight =
      phase === "collapsed" || phase === "collapsing"
        ? collapsedBodyHeightPx
        : Math.max(expandedBodyHeight, collapsedBodyHeightPx);
    const showPreviewLayer = collapsedPreviewOpen || phase === "collapsing";
    const expandedBodyContent = showSkeleton ? (
      <div className="space-y-2 py-1" data-article-hydration-state="loading">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[94%]" />
        <Skeleton className="h-3 w-[88%]" />
        <Skeleton className="h-3 w-[76%]" />
      </div>
    ) : !showFullContent ? null : isExpanded &&
      !hasScrapedContent &&
      !hasReadableContent ? (
      <p
        className="
          font-sans text-[0.93rem]/6 tracking-[-0.01em] text-muted-foreground/75
          antialiased
        "
      >
        Full article content unavailable. Open the original article to read
        more.
      </p>
    ) : useRichFormatting ? (
      <div
        className={`
          ${visibleRichContentClassName}
          ${visuallyExpanded ? `cursor-text select-text` : ""}
        `}
        dangerouslySetInnerHTML={{ __html: normalizedHtml }}
      />
    ) : (
      <p
        className={`
          font-sans tracking-[-0.01em] wrap-break-word whitespace-pre-line
          antialiased
          ${
            visuallyExpanded
              ? `cursor-text text-[0.97rem]/7 text-foreground/85 select-text`
              : `text-[0.93rem]/6 text-muted-foreground/85`
          }
        `}
      >
        {content}
      </p>
    );

    return (
      <div
        className={`
        relative
        ${visuallyExpanded ? "overflow-visible" : `overflow-hidden`}
        rounded-xl
      `}
        style={{
          touchAction: "pan-y",
        }}
      >
        {/* Swipe-to-read / swipe-to-star background indicators */}
        <div
          className={`
          pointer-events-none absolute inset-0 z-0 flex items-center rounded-xl
          ${readSwipeAtThreshold ? "bg-emerald-500/25" : "bg-emerald-500/10"}
        `}
          style={{
            opacity: readActive ? 1 : 0,
            transform: readSwipeAtThreshold ? "scale(1)" : "scale(0.985)",
            transition:
              readSwipeState.phase === "releasing"
                ? `opacity ${SWIPE_RELEASE_MS}ms ease-out`
                : readSwipeState.phase === "committing"
                  ? `opacity ${SWIPE_COMMIT_SLIDE_MS}ms ease-out`
                  : "none",
          }}
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
                size-5
                ${readSwipeAtThreshold ? "scale-110" : "scale-90 opacity-60"}
              `}
              />
            ) : (
              <CircleCheck
                className={`
                size-5
                ${readSwipeAtThreshold ? "scale-110" : "scale-90 opacity-60"}
              `}
              />
            )}
            <span
              className="text-xs font-medium"
              style={{
                opacity: readSwipeAtThreshold ? 1 : 0,
                transform: `translate3d(${readSwipeAtThreshold ? 0 : -4}px, 0, 0)`,
              }}
            >
              {article.isRead ? "Mark unread" : "Mark read"}
            </span>
          </div>
        </div>
        <div
          className={`
          pointer-events-none absolute inset-0 z-0 flex items-center justify-end
          rounded-xl
          ${starSwipeAtThreshold ? "bg-amber-500/25" : "bg-amber-500/10"}
        `}
          style={{
            opacity: starActive ? 1 : 0,
            transform: starSwipeAtThreshold ? "scale(1)" : "scale(0.985)",
            transition:
              starSwipeState.phase === "releasing"
                ? `opacity ${SWIPE_RELEASE_MS}ms ease-out`
                : starSwipeState.phase === "committing"
                  ? `opacity ${SWIPE_COMMIT_SLIDE_MS}ms ease-out`
                  : "none",
          }}
        >
          <div
            className="
            flex items-center gap-2 pr-4 text-amber-600
            dark:text-amber-400
          "
          >
            <span
              className="text-xs font-medium"
              style={{
                opacity: starSwipeAtThreshold ? 1 : 0,
                transform: `translate3d(${starSwipeAtThreshold ? 0 : 4}px, 0, 0)`,
              }}
            >
              {article.isStarred ? "Unstar" : "Star"}
            </span>
            <Star
              className={`
              size-5
              ${
                starSwipeAtThreshold
                  ? "scale-110 fill-current"
                  : "scale-90 opacity-60"
              }
            `}
            />
          </div>
        </div>
        <article
          aria-expanded={isExpanded}
          className={`
          group relative overflow-visible border
          border-border
          dark:shadow-2xl dark:shadow-zinc-900/50
          ${visuallyExpanded ? `rounded-t-[0.5rem] rounded-b-xl` : `rounded-xl`}
          ${
            article.isRead && !visuallyExpanded && !suppressCollapsedReadDimming
              ? `
        opacity-55 transition-opacity duration-200
        hover:opacity-100
      `
              : ""
          }
        `}
          data-article-collapsed-view-mode={
            visuallyExpanded ? "expanded" : articleViewMode
          }
          data-article-key={articleKey}
          data-swipe-active={anyActive ? "true" : "false"}
          data-swipe-direction={
            readActive ? "read" : starActive ? "star" : "idle"
          }
          data-swipe-read-at-threshold={readSwipeAtThreshold ? "true" : "false"}
          data-swipe-star-at-threshold={starSwipeAtThreshold ? "true" : "false"}
          onClick={toggleExpanded}
          onKeyDown={handleKeyDown}
          onMouseEnter={() => {
            if (!isGradientTrackedRef.current) {
              isGradientTrackedRef.current = true;
              setIsGradientTracked(true);
            }
          }}
          onMouseLeave={() => {
            if (!isExpanded && isGradientTrackedRef.current) {
              isGradientTrackedRef.current = false;
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
            transform:
              swipeOffsetX === 0
                ? undefined
                : `translate3d(${swipeOffsetX}px, 0, 0)`,
            transition: isActivelySwiping
              ? "none"
              : isSwipeAnimating
                ? `transform ${swipeTransitionMs}ms cubic-bezier(0.25, 1, 0.5, 1), border-radius ${cardT}`
                : `border-radius ${cardT}`,
            userSelect: visuallyExpanded ? "text" : "none",
            WebkitTouchCallout: visuallyExpanded ? "default" : "none",
            WebkitUserSelect: visuallyExpanded ? "text" : "none",
          }}
          tabIndex={0}
        >
          <ArticleCardHeader
            article={article}
            articleActionControlProps={articleActionControlProps}
            articleViewMode={articleViewMode}
            collapsedTitleClassName={collapsedArticleTitleClassName}
            encodedShareTitle={encodedShareTitle}
            encodedShareUrl={encodedShareUrl}
            faviconCacheKey={faviconCacheKey ?? ""}
            faviconCandidates={faviconCandidates}
            faviconIndex={faviconIndex}
            faviconTint={faviconTint}
            faviconUrl={faviconUrl ?? null}
            gradientCls={gradientCls}
            headerGradientOverlayRef={headerGradientOverlayRef}
            headerSwipeZoneRef={headerSwipeZoneRef}
            iconBtnCls={iconBtnCls}
            iconLinkCls={iconLinkCls}
            isDevelopment={isDevelopment}
            isMobile={isMobile}
            isShareMenuOpen={isShareMenuOpen}
            isUpdatingState={isUpdatingState}
            onCopyLinkOpen={() => {
              setIsCopyLinkOpen(true);
            }}
            onRawHtmlOpen={() => {
              setIsRawHtmlOpen(true);
            }}
            onShare={handleShare}
            onShareMenuOpenChange={handleShareMenuOpenChange}
            onToggleRead={onToggleRead}
            onToggleStarred={onToggleStarred}
            setFaviconIndex={setFaviconIndex}
            shareUrl={shareUrl}
            showFavicon={showFavicon}
            supportsNativeShare={supportsNativeShare}
            visuallyExpanded={visuallyExpanded}
          />

          <ArticleCardContent
            articleViewMode={articleViewMode}
            bodyMeasureRef={bodyMeasureRef}
            bodyTransitionMs={bodyTransitionMs}
            collapsedPreview={collapsedPreview}
            collapsedPreviewClassName={collapsedArticlePreviewClassName}
            contentGradientOverlayRef={contentGradientOverlayRef}
            contentZoneRef={contentZoneRef}
            expandedBodyContent={expandedBodyContent}
            gradientCls={gradientCls}
            phase={phase}
            resolvedBodyHeight={resolvedBodyHeight}
            showPreviewLayer={showPreviewLayer}
            stopExpandedContentPropagation={stopExpandedContentPropagation}
            visuallyExpanded={visuallyExpanded}
          />

          <ArticleCardDialogs
            copyLinkInputRef={copyLinkInputRef}
            isCopyLinkOpen={isCopyLinkOpen}
            isDevelopment={isDevelopment}
            isMobile={isMobile}
            isRawHtmlOpen={isRawHtmlOpen}
            normalizedHtml={normalizedHtml}
            onCopyLinkOpenChange={handleCopyLinkOpenChange}
            onRawHtmlOpenChange={handleRawHtmlOpenChange}
            onSelectRawHtml={handleSelectRawHtml}
            onSelectShareLink={handleSelectShareLink}
            rawHtmlTextAreaRef={rawHtmlTextAreaRef}
            shareUrl={shareUrl}
          />
        </article>
      </div>
    );
  },
);
