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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/useIsMobile";
import { type Article, formatRelativeDate } from "@/lib";
import { toPlainText } from "@/lib/utils/sanitize";
import {
  ArrowUpRight,
  CalendarDays,
  Circle,
  CircleCheck,
  Code,
  Copy,
  Globe,
  Share2,
  Star,
} from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildPreview,
  getArticleSourceLabel,
  getRichContentClass,
} from "../helpers/article-content";
import { setCachedFaviconIndex } from "../helpers/favicons";
import { useArticleExpansion, useArticleHeights } from "../hooks/useArticleExpansion";
import { useFavicon } from "../hooks/useFavicon";
import { ANIM_TRANSITION_COLORS } from "./styles";

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
  `inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 ${ANIM_TRANSITION_COLORS} hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50`;

const iconLinkCls =
  `inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/40 ${ANIM_TRANSITION_COLORS} hover:text-foreground`;

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
  const isDevelopment = process.env.NODE_ENV === "development";
  const isMobile = useIsMobile();

  const rawHtml = article.content || "";
  const plainContent = toPlainText(rawHtml).trim();
  const hasReadableContent = plainContent.length > 0;
  const content = plainContent || "No description available";
  const { preview, hasOverflow } = buildPreview(content);

  const { phase, isCollapsing, expandTransitionDone, onContentTransitionEnd } =
    useArticleExpansion(isExpanded, isHydrating);

  const showSkeleton = phase === "loading";
  const showFullContent = phase === "ready" || phase === "expanded" || isCollapsing;
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

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const toggleExpanded = (e: React.MouseEvent) => {
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
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle();
  };

  const copyTextWithFallbacks = async (value: string) => {
    const tryClipboardWrite = async () => {
      if (!navigator.clipboard?.writeText) return false;

      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        return false;
      }
    };

    const tryExecCommandCopy = () => {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = value;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.top = "-9999px";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textArea);
        return copied;
      } catch {
        return false;
      }
    };

    const copiedViaClipboardApi = await tryClipboardWrite();
    if (copiedViaClipboardApi) return true;

    const copiedViaExecCommand = tryExecCommandCopy();
    return copiedViaExecCommand;
  };

  const handleShare = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const shareUrl = article.link;
    if (!shareUrl) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: article.title,
          text: article.title,
          url: shareUrl,
        });
        return;
      }
    } catch {
    }

    const copied = await copyTextWithFallbacks(shareUrl);
    if (copied) {
      toast.success("Link copied");
      return;
    }

    toast.error("Could not copy link");
  };

  const handleCopyRawHtml = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const copied = await copyTextWithFallbacks(rawHtml);
    if (copied) {
      toast.success("HTML copied");
      return;
    }

    toast.error("Could not copy HTML");
  };

  return (
    <article
      data-article-key={articleKey}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={toggleExpanded}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      className={`group rounded-xl border bg-card/40 transition-[padding,background-color,max-height] anim-duration-ui anim-ease-ui hover:bg-card/70 ${visuallyExpanded ? "p-4" : "p-3"}`}
    >
      <div className={`space-y-2 ${visuallyExpanded ? "lg:space-y-2.5" : ""}`}>
        <div
          className={visuallyExpanded
            ? "sticky top-0 z-20 space-y-2 bg-card/95 pb-1 backdrop-blur-sm"
            : "space-y-2"
          }
        >
          <div className="flex items-center gap-2 text-xs leading-5 tracking-normal text-muted-foreground/70">
            <div className="flex min-w-0 items-center gap-2">
              <CalendarDays className="size-3" />
              {formatRelativeDate(new Date(article.publicationDate ?? Date.now()))}
              <span className="text-border">|</span>
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
                        const resolved = next < faviconCandidates.length ? next : -1;
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
                    <Globe className="size-2" style={{ color: faviconTint.foreground }} />
                  </span>
                )
              ) : null}
              <span className="truncate">{getArticleSourceLabel(article)}</span>
            </div>

            <div className="-mr-1 ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleRead();
                }}
                disabled={isUpdatingState}
                aria-label={article.isRead ? "Mark as unread" : "Mark as read"}
                className={iconBtnCls}
              >
                {article.isRead ? <CircleCheck className="size-3.5" /> : <Circle className="size-3.5" />}
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleStarred();
                }}
                disabled={isUpdatingState}
                aria-label={article.isStarred ? "Remove star" : "Star article"}
                className={iconBtnCls}
              >
                <Star className={`size-3.5 ${article.isStarred ? "fill-current" : ""}`} />
              </button>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleShare}
                aria-label="Share article"
                className="size-6 text-muted-foreground/50 hover:text-foreground"
              >
                <Share2 className="size-3.5" />
              </Button>

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
            className={`font-sans font-semibold antialiased tracking-[-0.012em] text-foreground ${visuallyExpanded ? "text-[1.03rem] leading-6" : "text-[0.96rem] leading-6 line-clamp-2"}`}
          >
            {article.title}
          </h3>

          <Separator className="my-1.5" />
        </div>

        <div>
          <div
            className="overflow-hidden transition-[max-height] anim-duration-ui anim-ease-ui"
            onTransitionEnd={onContentTransitionEnd}
            style={{
              maxHeight: expandTransitionDone
                ? "none"
                : hasOverflow
                  ? `${visuallyExpanded ? expandedHeight : collapsedHeight}px`
                  : "none",
              ...(hasOverflow && collapsedHeight === expandedHeight && !visuallyExpanded
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
            ) : hasOverflow && !showFullContent ? (
              <p className="font-sans antialiased tracking-[-0.01em] text-[0.93rem] leading-6 text-muted-foreground/85">
                {`${preview}…`}
              </p>
            ) : isExpanded && !hasScrapedContent && !hasReadableContent ? (
              <p className="font-sans antialiased tracking-[-0.01em] text-[0.93rem] leading-6 text-muted-foreground/75">
                Full article content unavailable. Open the original article to read more.
              </p>
            ) : useRichFormatting ? (
              <div
                className={visibleRichContentClassName}
                dangerouslySetInnerHTML={{ __html: article.content || "" }}
              />
            ) : (
              <p className={`whitespace-pre-line break-words font-sans antialiased tracking-[-0.01em] ${visuallyExpanded ? "text-[0.97rem] leading-7 text-foreground/85" : "text-[0.93rem] leading-6 text-muted-foreground/85"}`}>
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
                dangerouslySetInnerHTML={{ __html: article.content || "" }}
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
          <Drawer open={isRawHtmlOpen} onOpenChange={setIsRawHtmlOpen}>
            <DrawerContent
              className="max-h-[85dvh]"
              onClick={(event) => event.stopPropagation()}
            >
              <DrawerHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DrawerTitle>Raw Article HTML</DrawerTitle>
                    <DrawerDescription>
                      Development-only view of the current article content payload.
                    </DrawerDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyRawHtml}
                  >
                    <Copy className="size-3.5" />
                    Copy
                  </Button>
                </div>
              </DrawerHeader>
              <div className="px-4 pb-6">
                <div className="max-h-[60dvh] overflow-auto rounded-md border bg-muted/40 p-3">
                  <pre className="whitespace-pre-wrap break-all text-xs leading-5 text-foreground/90">
                    {rawHtml}
                  </pre>
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <Dialog open={isRawHtmlOpen} onOpenChange={setIsRawHtmlOpen}>
            <DialogContent
              className="max-w-3xl"
              onClick={(event) => event.stopPropagation()}
            >
              <DialogHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle>Raw Article HTML</DialogTitle>
                    <DialogDescription>
                      Development-only view of the current article content payload.
                    </DialogDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyRawHtml}
                  >
                    <Copy className="size-3.5" />
                    Copy
                  </Button>
                </div>
              </DialogHeader>
              <div className="max-h-[65vh] overflow-auto rounded-md border bg-muted/40 p-3">
                <pre className="whitespace-pre-wrap break-all text-xs leading-5 text-foreground/90">
                  {rawHtml}
                </pre>
              </div>
            </DialogContent>
          </Dialog>
        )
      ) : null}
    </article>
  );
};
