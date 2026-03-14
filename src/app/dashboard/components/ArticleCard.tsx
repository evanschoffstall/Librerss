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

import {
  useArticleExpansion,
  useArticleHeights,
} from "../hooks/useArticleExpansion";
import { useFavicon } from "../hooks/useFavicon";
import { useSwipeToRead } from "../hooks/useSwipeToRead";
import { useSwipeToStar } from "../hooks/useSwipeToStar";
import {
  buildPreview,
  getArticleSourceLabel,
  getRichContentClass,
} from "../services/article-content";
import { setCachedFaviconIndex } from "../services/favicons";

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
  onToggle: (article: Article) => void;
  onToggleRead: (article: Article) => void;
  onToggleStarred: (article: Article) => void;
  showFavicon: boolean;
  useRichFormatting: boolean;
}

const iconBtnCls =
  "inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors anim-duration-ui anim-ease-ui hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

const iconLinkCls =
  "inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/40 transition-colors anim-duration-ui anim-ease-ui hover:text-foreground";

const TAP_DRIFT_PX = 4;
const AFTER_SWIPE_BLOCK_MS = 350;

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
  onToggle,
  onToggleRead,
  onToggleStarred,
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

  const { expandTransitionDone, onContentTransitionEnd, phase } =
    useArticleExpansion(isExpanded, isHydrating);

  const showSkeleton = phase === "loading";
  const showFullContent = phase === "revealing" || phase === "expanded";
  const shouldMeasureExpandedHeight =
    !expandTransitionDone && (isExpanded || showSkeleton || showFullContent);
  const visuallyExpanded = phase === "expanded";
  const cardT =
    "var(--motion-duration-expand) var(--motion-ease-expand)" as const;

  const richContentClassName = getRichContentClass(isExpanded);
  const visibleRichContentClassName = getRichContentClass(visuallyExpanded);

  const { collapsedHeight, expandedHeight, fullContentRef, previewRef } =
    useArticleHeights(
      content,
      preview,
      richContentClassName,
      shouldMeasureExpandedHeight,
    );

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
  const shouldIgnoreSwipeTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;

    const control = target.closest(
      'button, input, textarea, select, summary, [contenteditable="true"]',
    );
    if (control) return true;

    const link = target.closest("a");
    if (!link) return false;

    return !contentZoneRef.current?.contains(link);
  }, []);

  const { containerRef: readSwipeRef, swipeState: readSwipeState } =
    useSwipeToRead(
      () => {
        afterSwipeRef.current = Date.now();
        if (isExpanded) {
          onExpandedSwipeRead(article);
          return;
        }
        onToggleRead(article);
      },
      isUpdatingState,
      shouldIgnoreSwipeTarget,
    );
  const { containerRef: starSwipeRef, swipeState: starSwipeState } =
    useSwipeToStar(
      () => {
        afterSwipeRef.current = Date.now();
        onToggleStarred(article);
      },
      isUpdatingState,
      shouldIgnoreSwipeTarget,
    );
  const anySwiping = readSwipeState.swiping || starSwipeState.swiping;
  const swipeOffsetX = readSwipeState.offsetX + starSwipeState.offsetX;
  const articleSurfaceRef = useCallback(
    (el: HTMLElement | null) => {
      articleRef.current = el;
      if (!el) return;
      readSwipeRef.current = el;
      starSwipeRef.current = el;
    },
    [readSwipeRef, starSwipeRef],
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

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (isExpandedBodyTarget(e.target)) return;
    if (shouldBlockArticleInteraction()) {
      e.stopPropagation();
      return;
    }
    pressPointerIdRef.current = e.pointerId;
    pressMovedRef.current = false;
    pressStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (isExpandedBodyTarget(e.target)) return;
    if (pressPointerIdRef.current !== e.pointerId) return;
    const start = pressStartPos.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > TAP_DRIFT_PX) pressMovedRef.current = true;
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLElement>) => {
    if (isExpandedBodyTarget(e.target)) return;
    if (pressPointerIdRef.current !== e.pointerId) return;
    pressPointerIdRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLElement>) => {
    if (isExpandedBodyTarget(e.target)) return;
    if (pressPointerIdRef.current !== e.pointerId) return;
    pressPointerIdRef.current = null;
    pressStartPos.current = null;
    pressMovedRef.current = false;
  };

  const toggleExpanded = (e: React.MouseEvent) => {
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
    onToggle(article);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (shouldBlockArticleInteraction()) {
      event.stopPropagation();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
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
      {readSwipeState.swiping && (
        <div
          className={`
            absolute inset-0 z-0 flex items-center rounded-xl transition-colors
            duration-150
            ${
              readSwipeState.committed
                ? "bg-emerald-500/25"
                : "bg-emerald-500/10"
            }
          `}
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
                    readSwipeState.committed
                      ? "scale-110"
                      : "scale-90 opacity-60"
                  }
                `}
              />
            ) : (
              <CircleCheck
                className={`
                  size-5 transition-transform duration-150
                  ${
                    readSwipeState.committed
                      ? "scale-110"
                      : "scale-90 opacity-60"
                  }
                `}
              />
            )}
            <span
              className={`
                text-xs font-medium transition-opacity duration-150
                ${readSwipeState.committed ? "opacity-100" : "opacity-0"}
              `}
            >
              {article.isRead ? "Mark unread" : "Mark read"}
            </span>
          </div>
        </div>
      )}
      {starSwipeState.swiping && (
        <div
          className={`
            absolute inset-0 z-0 flex items-center justify-end rounded-xl
            transition-colors duration-150
            ${starSwipeState.committed ? "bg-amber-500/25" : "bg-amber-500/10"}
          `}
        >
          <div
            className="
            flex items-center gap-2 pr-4 text-amber-600
            dark:text-amber-400
          "
          >
            <span
              className={`
                text-xs font-medium transition-opacity duration-150
                ${starSwipeState.committed ? "opacity-100" : "opacity-0"}
              `}
            >
              {article.isStarred ? "Unstar" : "Star"}
            </span>
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
        </div>
      )}
      <article
        aria-expanded={isExpanded}
        className={`
          article-swipe-surface group relative overflow-visible border
          border-border
          dark:shadow-2xl dark:shadow-zinc-900/50
          ${visuallyExpanded ? `rounded-t-[0.5rem] rounded-b-xl` : `rounded-xl`}
          ${
            article.isRead && !visuallyExpanded
              ? `
            *:opacity-55 *:transition-opacity *:duration-200
            hover:*:opacity-100
          `
              : ""
          }
        `}
        data-article-key={articleKey}
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
          transform: anySwiping ? `translateX(${swipeOffsetX}px)` : undefined,
          transition: anySwiping
            ? "none"
            : [
                swipeOffsetX !== 0
                  ? "transform 0.25s cubic-bezier(0.2,0,0,1)"
                  : null,
                `border-radius ${cardT}`,
                `box-shadow ${cardT}`,
              ]
                .filter(Boolean)
                .join(", "),
          userSelect: visuallyExpanded ? "text" : "none",
          WebkitTouchCallout: visuallyExpanded ? "default" : "none",
          WebkitUserSelect: visuallyExpanded ? "text" : "none",
        }}
        tabIndex={0}
      >
        {/* Header zone — sticky when expanded */}
        <div
          className={`
            relative
            ${
              visuallyExpanded
                ? `
              sticky top-0 z-50 rounded-t-xl bg-card/85 px-4 pt-4
            `
                : `rounded-t-xl bg-card/70 px-3 pt-3`
            }
          `}
          ref={headerZoneRef}
          style={{
            touchAction: "pan-y",
            transition: `padding ${cardT}, background-color ${cardT}`,
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
              <div
                className="
                flex shrink-0 items-center gap-2 whitespace-nowrap
              "
              >
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
                    : `
                  line-clamp-2 text-[0.96rem]/6 font-semibold
                `
                }
              `}
              style={{ transition: `font-size ${cardT}, line-height ${cardT}` }}
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
                : `
              rounded-b-xl px-3 pt-2 pb-3
            `
            }
          `}
          ref={contentZoneRef}
          style={{ transition: `padding ${cardT}` }}
        >
          <div
            className="
            pointer-events-none absolute inset-0 overflow-hidden rounded-b-xl
          "
          >
            <div className={gradientCls} style={contentGradientStyle} />
          </div>
          <div className="relative z-10">
            <div
              className={`
                article-swipe-body overflow-hidden
                ${visuallyExpanded ? `select-text` : ""}
              `}
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
              onTransitionEnd={onContentTransitionEnd}
              style={{
                cursor: visuallyExpanded ? "text" : undefined,
                maxHeight: expandTransitionDone
                  ? "none"
                  : hasOverflow
                    ? `${visuallyExpanded ? expandedHeight : collapsedHeight}px`
                    : "none",
                touchAction: "pan-y",
                userSelect: visuallyExpanded ? "text" : "none",
                WebkitTouchCallout: visuallyExpanded ? "default" : "none",
                WebkitUserSelect: visuallyExpanded ? "text" : "none",
                ...(hasOverflow &&
                collapsedHeight === expandedHeight &&
                !visuallyExpanded
                  ? { maxHeight: `${collapsedHeight}px` }
                  : {}),
                // content-visibility: auto helps with off-screen collapsed cards
                // but must NOT be active while expanded — it creates a containment
                // boundary the compositor uses as a touch-action walk stop-point,
                // breaking swipe gestures on the article body.
                contentVisibility:
                  expandTransitionDone && !visuallyExpanded
                    ? "auto"
                    : "visible",
                transition: `max-height ${cardT}`,
              }}
            >
              {showSkeleton ? (
                <div className="animate-pulse space-y-2 py-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-[94%]" />
                  <Skeleton className="h-3 w-[88%]" />
                  <Skeleton className="h-3 w-[76%]" />
                </div>
              ) : !showFullContent ? (
                <p
                  className="
                  line-clamp-1 font-sans text-[0.93rem]/6 tracking-[-0.01em]
                  text-muted-foreground/85 antialiased
                "
                >
                  {collapsedPreview}
                </p>
              ) : isExpanded && !hasScrapedContent && !hasReadableContent ? (
                <p
                  className="
                  anim-article-enter font-sans text-[0.93rem]/6
                  tracking-[-0.01em] text-muted-foreground/75 antialiased
                "
                >
                  Full article content unavailable. Open the original article to
                  read more.
                </p>
              ) : useRichFormatting ? (
                <div
                  className={`
                    ${visibleRichContentClassName}
                    ${visuallyExpanded ? `cursor-text select-text` : ""}
                    anim-article-enter
                  `}
                  dangerouslySetInnerHTML={{ __html: normalizedHtml }}
                  style={{
                    contain: visuallyExpanded ? "none" : "layout style paint",
                    willChange: visuallyExpanded ? "auto" : "contents",
                  }}
                />
              ) : (
                <p
                  className={`
                    anim-article-enter font-sans tracking-[-0.01em]
                    wrap-break-word whitespace-pre-line antialiased
                    ${
                      visuallyExpanded
                        ? `
                      cursor-text text-[0.97rem]/7 text-foreground/85
                      select-text
                    `
                        : `text-[0.93rem]/6 text-muted-foreground/85`
                    }
                  `}
                >
                  {content}
                </p>
              )}
            </div>

            {/* Hidden measurement targets for height animation */}
            <p
              aria-hidden="true"
              className="
                pointer-events-none h-0 overflow-hidden font-sans
                text-[0.93rem]/6 tracking-[-0.01em] antialiased opacity-0
              "
              ref={previewRef}
            >
              {`${preview}…`}
            </p>
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
      </article>
    </div>
  );
});
