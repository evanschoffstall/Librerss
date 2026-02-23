import { Skeleton } from "@/components/ui/skeleton";
import { type Article, formatRelativeDate } from "@/lib";
import { CONFIG } from "@/lib/config";
import { ArrowUpRight, CalendarDays, Circle, CircleCheck, Globe, Star } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  getCachedFaviconIndex,
  getFaviconCacheKey,
  getFaviconTintColors,
  getHostnameLabel,
  getMergedFaviconCandidates,
  setCachedFaviconIndex,
} from "../helpers/favicons";

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

const toPlainText = (value: string) => {
  const maxConsecutiveBlankLines = CONFIG.MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;
  const minOverflowRun = maxConsecutiveBlankLines + 1;

  return value
    // Strip figure/figcaption blocks (and any nested content) so image
    // captions like "Image: Pic: iStock" don't appear in the preview.
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "\n")
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, "\n")
    // Preserve block boundaries and explicit line breaks.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|blockquote|li|h[1-6]|ul|ol|pre)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(new RegExp(`(?:\\n){${minOverflowRun},}`, "g"), "\n".repeat(maxConsecutiveBlankLines))
    .trim();
};

const getArticleSourceLabel = (article: Article) => {
  if (article.feedName?.trim()) {
    return article.feedName;
  }

  return getHostnameLabel(article.feedUrl ?? article.link);
};

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
  const previewLimit = 170;
  const hasOverflow = content.length > previewLimit;
  const preview = hasOverflow
    ? (() => {
      const candidate = content.slice(0, previewLimit + 1);
      const lastSpace = candidate.lastIndexOf(" ");
      const safeCut = lastSpace > 0 ? candidate.slice(0, lastSpace) : content.slice(0, previewLimit);
      return safeCut.trimEnd();
    })()
    : content;
  // ── Expansion state machine ────────────────────────────────────────────
  //
  //  collapsed : default card view with preview text
  //  loading   : skeleton visible, card stays at collapsed size
  //  ready     : real content rendered, card still at collapsed size
  //              (one rAF to let browser paint, then → expanded)
  //  expanded  : fully open, animated to expanded size
  //
  //  Click (collapsed → loading): show skeleton immediately (no size change)
  //  Hydration done (loading → ready): swap skeleton for real content (no size change)
  //  Next frame (ready → expanded): animate card open
  //  Click again (expanded → collapsed): animate card closed

  type Phase = "collapsed" | "loading" | "ready" | "expanded";
  const [phase, setPhase] = useState<Phase>(isExpanded ? "expanded" : "collapsed");
  const [isCollapsing, setIsCollapsing] = useState(false);
  const [expandTransitionDone, setExpandTransitionDone] = useState(isExpanded);

  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [expandedHeight, setExpandedHeight] = useState(0);

  const faviconCandidates = getMergedFaviconCandidates(article.feedUrl, article.link);
  const faviconCacheKey = getFaviconCacheKey(article.feedUrl, article.link);
  const [faviconIndex, setFaviconIndex] = useState(() => getCachedFaviconIndex(faviconCacheKey));
  const faviconUrl = faviconIndex >= 0 ? faviconCandidates[faviconIndex] : undefined;
  const faviconTint = getFaviconTintColors(article.feedUrl, article.link);
  const previewRef = useRef<HTMLParagraphElement>(null);
  const fullContentRef = useRef<HTMLDivElement>(null);

  // Derive everything from phase:
  const showSkeleton = phase === "loading";
  const showFullContent = phase === "ready" || phase === "expanded" || isCollapsing;
  const visuallyExpanded = phase === "expanded" || isCollapsing;
  const transitionDuration = "duration-150";
  const transitionEase = "ease-linear";

  const expandedRichClass = "text-sm leading-relaxed text-foreground/70 break-words [&_p]:m-0 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_p:empty]:h-[1em] [&_p:empty]:mb-0 [&_h1]:mb-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_blockquote]:mb-3 [&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted/35 [&_pre]:p-2 [&_code]:rounded [&_code]:bg-muted/35 [&_code]:px-1 [&_code]:py-0.5 [&_a]:underline [&_a]:underline-offset-2 [&_figure]:hidden [&_figcaption]:hidden";
  const collapsedRichClass = "text-xs leading-relaxed text-muted-foreground/75 break-words [&_p]:m-0 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_p:empty]:h-[1em] [&_p:empty]:mb-0 [&_h1]:mb-3 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_blockquote]:mb-3 [&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted/35 [&_pre]:p-2 [&_code]:rounded [&_code]:bg-muted/35 [&_code]:px-1 [&_code]:py-0.5 [&_a]:underline [&_a]:underline-offset-2 [&_figure]:hidden [&_figcaption]:hidden";
  const richContentClassName = isExpanded ? expandedRichClass : collapsedRichClass;
  const visibleRichContentClassName = visuallyExpanded ? expandedRichClass : collapsedRichClass;

  // Favicon cache sync
  useEffect(() => {
    setFaviconIndex(getCachedFaviconIndex(faviconCacheKey));
  }, [faviconCacheKey]);

  // Height measurement for max-height animation
  useEffect(() => {
    const measure = () => {
      if (!previewRef.current || !fullContentRef.current) {
        setCollapsedHeight(0);
        setExpandedHeight(0);
        return;
      }
      setCollapsedHeight(previewRef.current.scrollHeight);
      setExpandedHeight(fullContentRef.current.scrollHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [content, preview, richContentClassName]);

  // ── Phase transitions ─────────────────────────────────────────────────
  useEffect(() => {
    if (isExpanded) {
      if (isHydrating) {
        // Clicked but content not ready yet → show skeleton
        setPhase("loading");
      } else {
        setPhase((currentPhase) =>
          currentPhase === "loading" || currentPhase === "collapsed" ? "ready" : currentPhase,
        );
      }
    } else {
      // Collapsed: if we were expanded, trigger collapse animation
      setPhase((currentPhase) => {
        if (currentPhase === "expanded") {
          setIsCollapsing(true);
          setExpandTransitionDone(false);
          requestAnimationFrame(() => {
            setPhase("collapsed");
            setIsCollapsing(false);
          });
          return currentPhase;
        }

        // Already collapsed or was loading/ready — just reset
        setIsCollapsing(false);
        setExpandTransitionDone(false);
        return "collapsed";
      });
    }
  }, [isExpanded, isHydrating]);

  // ready → expanded: wait one frame for browser to paint content at
  // collapsed size, then animate open
  useEffect(() => {
    if (phase !== "ready") return;
    const frame = requestAnimationFrame(() => {
      setPhase("expanded");
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const toggleExpanded = (e: React.MouseEvent) => {
    // If the user dragged (to select text), don't toggle.
    const down = mouseDownPos.current;
    if (down) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.sqrt(dx * dx + dy * dy) > 4) return;
    }
    // If the user has made a text selection, don't toggle.
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    onToggle();
  };

  const handleContentTransitionEnd = () => {
    if (phase === "expanded") {
      // Expand animation finished – remove fixed max-height so images and
      // other lazy-loaded content can grow the container freely.
      setExpandTransitionDone(true);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

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
      className={`group relative flex flex-col rounded-xl border bg-card/40 transition-[padding,background-color,max-height] ${transitionDuration} ${transitionEase} hover:bg-card/70 ${visuallyExpanded ? "p-4" : "p-3"}`}
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
            className={`overflow-hidden transition-[max-height] ${transitionDuration} ${transitionEase}`}
            onTransitionEnd={handleContentTransitionEnd}
            style={{
              maxHeight:
                expandTransitionDone
                  ? "none"
                  : hasOverflow
                    ? `${visuallyExpanded ? expandedHeight : collapsedHeight}px`
                    : "none",
              // If heights are equal the browser won't fire transitionend; hide directly.
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
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors duration-150 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors duration-150 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
        className="absolute bottom-2 right-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors duration-150 hover:text-foreground"
      >
        <ArrowUpRight className="size-3.5" />
      </a>
    </article>
  );
};
