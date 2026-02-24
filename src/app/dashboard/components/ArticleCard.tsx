import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { type Article, formatRelativeDate } from "@/lib";
import { toPlainText } from "@/lib/utils/sanitize";
import { ArrowUpRight, CalendarDays, Circle, CircleCheck, Globe, Star } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
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
  const plainContent = toPlainText(article.content || "").trim();
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
    </article>
  );
};
