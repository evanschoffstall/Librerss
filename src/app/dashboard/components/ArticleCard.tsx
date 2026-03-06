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
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { normalizeArticleHtmlSpacing, toPlainText } from "@/lib/sanitize";
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
import { useTheme } from "next-themes";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useArticleExpansion,
  useArticleHeights,
} from "../hooks/useArticleExpansion";
import { useFavicon } from "../hooks/useFavicon";
import { useSwipeToRead } from "../hooks/useSwipeToRead";
import {
  buildPreview,
  getArticleSourceLabel,
  getRichContentClass,
} from "../services/article-content";
import { setCachedFaviconIndex } from "../services/favicons";

interface ArticleCardProps {
  articleKey: string;
  article: Article;
  isExpanded: boolean;
  useRichFormatting: boolean;
  hasScrapedContent: boolean;
  isHydrating: boolean;
  onToggle: () => void;
  showFavicon: boolean;
  onToggleRead: () => void;
  onToggleStarred: () => void;
  isUpdatingState: boolean;
}

const iconBtnCls =
  "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors anim-duration-ui anim-ease-ui hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

const iconLinkCls =
  "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors anim-duration-ui anim-ease-ui hover:text-foreground";

export const ArticleCard = ({
  articleKey,
  article,
  isExpanded,
  useRichFormatting,
  hasScrapedContent,
  isHydrating,
  onToggle,
  showFavicon,
  onToggleRead,
  onToggleStarred,
  isUpdatingState,
}: ArticleCardProps) => {
  const [isRawHtmlOpen, setIsRawHtmlOpen] = useState(false);
  const [isCopyLinkOpen, setIsCopyLinkOpen] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [supportsNativeShare, setSupportsNativeShare] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);
  const isDevelopment = process.env.NODE_ENV === "development";
  const isMobile = useIsMobile();
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme ?? "dark") === "dark";

  const rawHtml = article.content || "";
  const normalizedHtml = normalizeArticleHtmlSpacing(rawHtml);
  const plainContent = toPlainText(normalizedHtml).trim();
  const hasReadableContent = plainContent.length > 0;
  const content = plainContent || "No description available";
  const { preview, hasOverflow } = buildPreview(content);
  const collapsedPreview = hasOverflow ? `${preview}…` : preview;

  const { phase, isCollapsing, expandTransitionDone, onContentTransitionEnd } =
    useArticleExpansion(isExpanded, isHydrating);

  const showSkeleton = phase === "loading";
  const showFullContent =
    phase === "ready" || phase === "expanded" || isCollapsing;
  const visuallyExpanded = phase === "expanded" || isCollapsing;

  const richContentClassName = getRichContentClass(isExpanded);
  const visibleRichContentClassName = getRichContentClass(visuallyExpanded);

  const { previewRef, fullContentRef, collapsedHeight, expandedHeight } =
    useArticleHeights(content, preview, richContentClassName);

  const {
    faviconUrl,
    faviconTint,
    faviconCacheKey,
    faviconIndex,
    faviconCandidates,
    setFaviconIndex,
  } = useFavicon({ primaryUrl: article.feedUrl, fallbackUrl: article.link });

  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  const rawHtmlTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const copyLinkInputRef = useRef<HTMLInputElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const interactionBlockUntilRef = useRef(0);

  const { swipeState, containerRef: swipeContainerRef } = useSwipeToRead(() => {
    if (!article.isRead) onToggleRead();
  }, isUpdatingState || article.isRead);

  const shouldBlockArticleInteraction = () =>
    Date.now() < interactionBlockUntilRef.current;

  const blockArticleInteractionTemporarily = () => {
    interactionBlockUntilRef.current = Date.now() + 200;
  };

  const handleRawHtmlOpenChange = (open: boolean) => {
    setIsRawHtmlOpen(open);
    if (!open) {
      blockArticleInteractionTemporarily();
    }
  };

  const handleCopyLinkOpenChange = (open: boolean) => {
    setIsCopyLinkOpen(open);
    if (!open) {
      blockArticleInteractionTemporarily();
    }
  };

  const handleShareMenuOpenChange = (open: boolean) => {
    setIsShareMenuOpen(open);
    if (!open) {
      blockArticleInteractionTemporarily();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (shouldBlockArticleInteraction()) {
      e.stopPropagation();
      return;
    }
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const toggleExpanded = (e: React.MouseEvent) => {
    if (shouldBlockArticleInteraction()) {
      e.stopPropagation();
      return;
    }
    const down = mouseDownPos.current;
    if (down) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.sqrt(dx * dx + dy * dy) > 4) return;
    }
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    onToggle();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (shouldBlockArticleInteraction()) {
      event.stopPropagation();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle();
  };

  useEffect(() => {
    setSupportsNativeShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
  }, []);

  useEffect(() => {
    const updateHoverState = () => {
      const target = articleRef.current;
      const pointer = pointerPosRef.current;

      if (!target || !pointer) {
        setIsCardHovered(false);
        return;
      }

      const element = document.elementFromPoint(pointer.x, pointer.y);
      setIsCardHovered(Boolean(element && target.contains(element)));
    };

    const handleMouseMove = (event: MouseEvent) => {
      pointerPosRef.current = { x: event.clientX, y: event.clientY };
      updateHoverState();
    };

    const handleWindowMouseLeave = (event: MouseEvent) => {
      if (event.relatedTarget !== null) return;
      setIsCardHovered(false);
      pointerPosRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseleave", handleWindowMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleWindowMouseLeave);
    };
  }, []);

  const handleShare = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const shareUrl = article.link;
    if (!shareUrl) return;

    try {
      await navigator.share({
        title: article.title,
        text: article.title,
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

    return () => window.clearTimeout(timer);
  }, [isCopyLinkOpen]);

  useEffect(() => {
    if (!isRawHtmlOpen) return;

    const timer = window.setTimeout(() => {
      selectRawHtml();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isRawHtmlOpen]);

  const copyLinkInputBlock = (
    <div className="rounded-md border bg-muted/30 p-2">
      <Input
        ref={copyLinkInputRef}
        value={shareUrl || ""}
        readOnly
        className="h-8 border-0 bg-transparent px-2 font-mono text-xs shadow-none"
        aria-label="Article link"
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => event.currentTarget.select()}
      />
    </div>
  );

  const copyLinkSelectAction = (
    <div className="flex justify-end">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleSelectShareLink}
      >
        Select
      </Button>
    </div>
  );

  return (
    <div
      ref={swipeContainerRef}
      className="relative overflow-hidden rounded-xl"
    >
      {/* Swipe-to-read background indicator */}
      {swipeState.swiping && (
        <div
          className={`absolute inset-0 z-0 flex items-center rounded-xl transition-colors duration-150 ${
            swipeState.committed ? "bg-emerald-500/25" : "bg-emerald-500/10"
          }`}
        >
          <div className="flex items-center gap-2 pl-4 text-emerald-600 dark:text-emerald-400">
            <CircleCheck
              className={`size-5 transition-transform duration-150 ${
                swipeState.committed ? "scale-110" : "scale-90 opacity-60"
              }`}
            />
            <span
              className={`text-xs font-medium transition-opacity duration-150 ${
                swipeState.committed ? "opacity-100" : "opacity-0"
              }`}
            >
              Mark read
            </span>
          </div>
        </div>
      )}
      <article
        ref={articleRef}
        data-article-key={articleKey}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onMouseLeave={() => setIsCardHovered(false)}
        style={{
          transform: swipeState.swiping
            ? `translateX(${swipeState.offsetX}px)`
            : undefined,
          transition: swipeState.swiping
            ? "none"
            : "transform 0.25s cubic-bezier(0.2,0,0,1)",
        }}
        className={`group relative ${visuallyExpanded ? "overflow-visible" : "overflow-hidden"} rounded-xl border border-border bg-card/70 dark:shadow-2xl dark:shadow-zinc-900/50 transition-[padding,background-color,max-height,border-color] duration-700 anim-ease-ui md:gap-8 ${article.isRead && !visuallyExpanded ? "opacity-55 transition-opacity duration-200 hover:opacity-100" : ""} ${visuallyExpanded ? "p-4" : "p-3"}`}
      >
        <div className="pointer-events-none absolute inset-0 rounded-xl">
          <div
            className={`absolute inset-0 z-10 rounded-xl bg-gradient-to-br transition duration-1000 ${
              isDark
                ? "from-zinc-100/20 via-zinc-100/10 to-transparent mix-blend-overlay"
                : "from-zinc-900/20 via-zinc-900/10 to-transparent mix-blend-overlay"
            } ${isCardHovered ? "opacity-100" : "opacity-0"}`}
          />
        </div>

        <div
          className={`relative z-20 space-y-2 ${visuallyExpanded ? "lg:space-y-2.5" : ""}`}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs leading-5 tracking-normal text-muted-foreground/70">
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                <CalendarDays className="size-3" />
                {formatRelativeDate(
                  new Date(article.publicationDate ?? Date.now()),
                )}
                <span
                  className="size-1 shrink-0 rounded-full bg-border/80"
                  aria-hidden="true"
                />
              </div>
              <div className="flex min-w-0 items-center gap-2">
                {showFavicon ? (
                  faviconUrl ? (
                    <img
                      src={faviconUrl}
                      alt=""
                      className="size-3 rounded-sm"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onLoad={() => {
                        setCachedFaviconIndex(faviconCacheKey, faviconIndex);
                      }}
                      onError={() => {
                        setFaviconIndex((current) => {
                          const next = current + 1;
                          const resolved =
                            next < faviconCandidates.length ? next : -1;
                          setCachedFaviconIndex(faviconCacheKey, resolved);
                          return resolved;
                        });
                      }}
                    />
                  ) : (
                    <span
                      className="inline-flex size-3 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: faviconTint.background }}
                      aria-hidden="true"
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
                className={`-mr-1 ml-auto flex shrink-0 items-center gap-1 transition-opacity duration-150 ${visuallyExpanded || isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleRead();
                  }}
                  disabled={isUpdatingState}
                  aria-label={
                    article.isRead ? "Mark as unread" : "Mark as read"
                  }
                  className={iconBtnCls}
                >
                  {article.isRead ? (
                    <CircleCheck className="size-3.5" />
                  ) : (
                    <Circle className="size-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleStarred();
                  }}
                  disabled={isUpdatingState}
                  aria-label={
                    article.isStarred ? "Remove star" : "Star article"
                  }
                  className={iconBtnCls}
                >
                  <Star
                    className={`size-3.5 ${article.isStarred ? "fill-current" : ""}`}
                  />
                </button>

                {supportsNativeShare ? (
                  <button
                    type="button"
                    onClick={handleShare}
                    aria-label="Share article"
                    className={iconBtnCls}
                  >
                    <Share2 className="size-3.5" />
                  </button>
                ) : (
                  <DropdownMenu
                    open={isShareMenuOpen}
                    onOpenChange={handleShareMenuOpenChange}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(event) => event.stopPropagation()}
                        aria-label="Share article options"
                        className={iconBtnCls}
                      >
                        <Share2 className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onClick={(event: React.MouseEvent) =>
                        event.stopPropagation()
                      }
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
                        onSelect={() => setIsShareMenuOpen(false)}
                        asChild
                      >
                        <a
                          href={`mailto:?subject=${encodedShareTitle}&body=${encodedShareUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Mail className="size-3.5" />
                          Email
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setIsShareMenuOpen(false)}
                        asChild
                      >
                        <a
                          href={`https://www.reddit.com/submit?url=${encodedShareUrl}&title=${encodedShareTitle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Share to Reddit
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setIsShareMenuOpen(false)}
                        asChild
                      >
                        <a
                          href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`${article.title} ${shareUrl || ""}`.trim())}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Share to Bluesky
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {isDevelopment ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsRawHtmlOpen(true);
                    }}
                    aria-label="View raw article HTML"
                    className={iconBtnCls}
                  >
                    <Code className="size-3.5" />
                  </button>
                ) : null}

                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Open article"
                  className={iconLinkCls}
                >
                  <ArrowUpRight className="size-3.5" />
                </a>
              </div>
            </div>

            <h3
              className={`font-sans font-semibold antialiased tracking-[-0.012em] text-foreground ${visuallyExpanded ? "text-[1.05rem] leading-6" : "text-[0.96rem] leading-6 line-clamp-2"}`}
            >
              {article.title}
            </h3>
          </div>

          <div className="mt-2">
            <div
              className="overflow-hidden transition-[max-height] anim-duration-ui anim-ease-ui"
              onTransitionEnd={onContentTransitionEnd}
              onClick={
                visuallyExpanded
                  ? (e) => {
                      // Stop propagation only for interactive elements / text selection; blank areas toggle collapse
                      const el = e.target as HTMLElement;
                      if (
                        el.closest(
                          "a, button, input, textarea, select, [role='button']",
                        )
                      )
                        return e.stopPropagation();
                      if (window.getSelection()?.toString())
                        return e.stopPropagation();
                    }
                  : undefined
              }
              style={{
                maxHeight: expandTransitionDone
                  ? "none"
                  : hasOverflow
                    ? `${visuallyExpanded ? expandedHeight : collapsedHeight}px`
                    : "none",
                ...(hasOverflow &&
                collapsedHeight === expandedHeight &&
                !visuallyExpanded
                  ? { maxHeight: `${collapsedHeight}px` }
                  : {}),
              }}
            >
              {showSkeleton ? (
                <div className="space-y-2 py-1 animate-pulse">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-[94%]" />
                  <Skeleton className="h-3 w-[88%]" />
                  <Skeleton className="h-3 w-[76%]" />
                </div>
              ) : !showFullContent ? (
                <p className="line-clamp-1 font-sans antialiased tracking-[-0.01em] text-[0.93rem] leading-6 text-muted-foreground/85">
                  {collapsedPreview}
                </p>
              ) : isExpanded && !hasScrapedContent && !hasReadableContent ? (
                <p className="font-sans antialiased tracking-[-0.01em] text-[0.93rem] leading-6 text-muted-foreground/75">
                  Full article content unavailable. Open the original article to
                  read more.
                </p>
              ) : useRichFormatting ? (
                <div
                  className={visibleRichContentClassName}
                  dangerouslySetInnerHTML={{ __html: normalizedHtml }}
                />
              ) : (
                <p
                  className={`whitespace-pre-line break-words font-sans antialiased tracking-[-0.01em] ${visuallyExpanded ? "text-[0.97rem] leading-7 text-foreground/85" : "text-[0.93rem] leading-6 text-muted-foreground/85"}`}
                >
                  {content}
                </p>
              )}
            </div>

            {/* Hidden measurement targets for height animation */}
            <p
              ref={previewRef}
              aria-hidden="true"
              className="pointer-events-none h-0 overflow-hidden opacity-0 font-sans antialiased tracking-[-0.01em] text-[0.93rem] leading-6"
            >
              {`${preview}…`}
            </p>
            <div
              ref={fullContentRef}
              aria-hidden="true"
              className="pointer-events-none h-0 overflow-hidden opacity-0"
            >
              {useRichFormatting ? (
                <div
                  className={richContentClassName}
                  dangerouslySetInnerHTML={{ __html: normalizedHtml }}
                />
              ) : (
                <p className="font-sans antialiased tracking-[-0.01em] text-[0.97rem] leading-7 whitespace-pre-line break-words text-foreground/85">
                  {content}
                </p>
              )}
            </div>
          </div>
        </div>

        {isDevelopment ? (
          isMobile ? (
            <Drawer open={isRawHtmlOpen} onOpenChange={handleRawHtmlOpenChange}>
              <DrawerContent
                className="max-h-[85dvh]"
                onClick={(event) => event.stopPropagation()}
              >
                <DrawerHeader className="space-y-2 text-left">
                  <div className="flex w-full items-start justify-between gap-3 text-left">
                    <div className="min-w-0 flex-1 text-left">
                      <DrawerTitle>Raw Article HTML</DrawerTitle>
                      <DrawerDescription>
                        Development-only view of the current article content
                        payload.
                      </DrawerDescription>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={handleSelectRawHtml}
                    >
                      Select
                    </Button>
                  </div>
                </DrawerHeader>
                <div className="px-4 pb-6">
                  <div className="rounded-md border bg-muted/40 p-3">
                    <textarea
                      ref={rawHtmlTextAreaRef}
                      value={normalizedHtml}
                      readOnly
                      aria-label="Raw article HTML"
                      className="h-[60dvh] min-h-[12rem] w-full resize-none border-0 bg-transparent p-0 font-mono text-xs leading-5 text-foreground/90 shadow-none outline-none"
                      onClick={(event) => event.stopPropagation()}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          ) : (
            <Dialog open={isRawHtmlOpen} onOpenChange={handleRawHtmlOpenChange}>
              <DialogContent
                className="max-w-3xl"
                onClick={(event) => event.stopPropagation()}
              >
                <DialogHeader className="space-y-2 text-left">
                  <div className="flex w-full items-start justify-between gap-3 text-left">
                    <div className="min-w-0 flex-1 text-left">
                      <DialogTitle>Raw Article HTML</DialogTitle>
                      <DialogDescription>
                        Development-only view of the current article content
                        payload.
                      </DialogDescription>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={handleSelectRawHtml}
                    >
                      Select
                    </Button>
                  </div>
                </DialogHeader>
                <div className="rounded-md border bg-muted/40 p-3">
                  <textarea
                    ref={rawHtmlTextAreaRef}
                    value={normalizedHtml}
                    readOnly
                    aria-label="Raw article HTML"
                    className="h-[65vh] min-h-[14rem] w-full resize-none border-0 bg-transparent p-0 font-mono text-xs leading-5 text-foreground/90 shadow-none outline-none"
                    onClick={(event) => event.stopPropagation()}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )
        ) : null}

        {isMobile ? (
          <Drawer open={isCopyLinkOpen} onOpenChange={handleCopyLinkOpenChange}>
            <DrawerContent
              className="max-h-[45dvh]"
              onClick={(event) => event.stopPropagation()}
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
          <Dialog open={isCopyLinkOpen} onOpenChange={handleCopyLinkOpenChange}>
            <DialogContent
              className="max-w-md"
              onClick={(event) => event.stopPropagation()}
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
};
