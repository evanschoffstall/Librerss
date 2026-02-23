import { Skeleton } from "@/components/ui/skeleton";
import { type Article, formatRelativeDate } from "@/lib";
import { ArrowUpRight, CalendarDays, Circle, CircleCheck, Globe, Star } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import {
  buildPreview,
  getArticleSourceLabel,
  getRichContentClass,
  toPlainText,
} from "../helpers/article-content";
import { setCachedFaviconIndex } from "../helpers/favicons";
import { useArticleExpansion, useArticleHeights } from "../hooks/useArticleExpansion";
import { useFavicon } from "../hooks/useFavicon";

interface ArticleCardProps {
  articleKey: string;
  article: Article;
  isExpanded: boolean;
  useRichFormatting: boolean;
  isHydrating: boolean;
  onToggle: () => void;
  showFavicon: boolean;
  onToggleRead: () => void;
  onToggleStarred: () => void;
  isUpdatingState: boolean;
}

export const ArticleCard = ({
  articleKey,
  article,
  isExpanded,
  useRichFormatting,
  isHydrating,
  onToggle,
  showFavicon,
  onToggleRead,
  onToggleStarred,
  isUpdatingState,
}: ArticleCardProps) => {
  const content = toPlainText(article.content || "") || "No description available";
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
      className={`group relative flex flex-col rounded-xl border bg-card/40 transition-[padding,background-color,max-height] anim-duration-ui anim-ease-ui hover:bg-card/70 ${visuallyExpanded ? "p-4" : "p-3"}`}
    >
      <div className="space-y-2 pr-16">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
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

        <h3 className={`text-sm font-medium leading-snug ${visuallyExpanded ? "" : "line-clamp-2"}`}>
          {article.title}
        </h3>

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
              <p className="text-xs leading-relaxed text-muted-foreground/75">
                {`${preview}…`}
              </p>
            ) : useRichFormatting ? (
              <div
                className={visibleRichContentClassName}
                dangerouslySetInnerHTML={{ __html: article.content || "" }}
              />
            ) : (
              <p className={`leading-relaxed whitespace-pre-line break-words ${visuallyExpanded ? "text-sm text-foreground/70" : "text-xs text-muted-foreground/75"}`}>
                {content}
              </p>
            )}
          </div>

          {/* Hidden measurement targets for height animation */}
          <p
            ref={previewRef}
            aria-hidden="true"
            className="pointer-events-none h-0 overflow-hidden opacity-0 text-xs leading-relaxed"
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
              <p className="text-xs leading-relaxed whitespace-pre-line break-words text-muted-foreground/75">
                {content}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleRead();
          }}
          disabled={isUpdatingState}
          aria-label={article.isRead ? "Mark as unread" : "Mark as read"}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors anim-duration-ui anim-ease-ui hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors anim-duration-ui anim-ease-ui hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Star className={`size-3.5 ${article.isStarred ? "fill-current" : ""}`} />
        </button>
      </div>

      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Open article"
        className="absolute bottom-2 right-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors anim-duration-ui anim-ease-ui hover:text-foreground"
      >
        <ArrowUpRight className="size-3.5" />
      </a>
    </article>
  );
};
