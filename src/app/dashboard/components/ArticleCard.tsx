import { type Article } from "@/lib";
import { motion } from "framer-motion";
import { ArrowUpRight, CalendarDays, Loader2 } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  getCachedFaviconIndex,
  getFaviconCacheKey,
  getHostnameLabel,
  getMergedFaviconCandidates,
  setCachedFaviconIndex,
} from "./favicons";

interface ArticleCardProps {
  article: Article;
  isExpanded: boolean;
  useRichFormatting: boolean;
  isHydrating: boolean;
  onToggle: () => void;
  showFavicon: boolean;
}

const toPlainText = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

const getArticleSourceLabel = (article: Article) => {
  if (article.feedName?.trim()) {
    return article.feedName;
  }

  return getHostnameLabel(article.feedUrl ?? article.link);
};

export const ArticleCard = ({
  article,
  isExpanded,
  useRichFormatting,
  isHydrating,
  onToggle,
  showFavicon,
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
  // showFullContent leads isExpanded so the text swap happens before the
  // height animation finishes (expand) and after it finishes (collapse).
  const [showFullContent, setShowFullContent] = useState(isExpanded);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [expandedHeight, setExpandedHeight] = useState(0);
  const faviconCandidates = getMergedFaviconCandidates(article.feedUrl, article.link);
  const faviconCacheKey = getFaviconCacheKey(article.feedUrl, article.link);
  const [faviconIndex, setFaviconIndex] = useState(() => getCachedFaviconIndex(faviconCacheKey));
  const faviconUrl = faviconIndex >= 0 ? faviconCandidates[faviconIndex] : undefined;
  const previewRef = useRef<HTMLParagraphElement>(null);
  const fullContentRef = useRef<HTMLDivElement>(null);

  const richContentClassName = isExpanded
    ? "text-sm leading-relaxed text-foreground/70 whitespace-pre-wrap break-words [&_p]:mb-3 [&_p:last-child]:mb-0 [&_h1]:mb-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_blockquote]:mb-3 [&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted/35 [&_pre]:p-2 [&_code]:rounded [&_code]:bg-muted/35 [&_code]:px-1 [&_code]:py-0.5 [&_a]:underline [&_a]:underline-offset-2"
    : "text-xs leading-relaxed text-muted-foreground/75 whitespace-pre-wrap break-words [&_p]:mb-3 [&_p:last-child]:mb-0 [&_h1]:mb-3 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_blockquote]:mb-3 [&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted/35 [&_pre]:p-2 [&_code]:rounded [&_code]:bg-muted/35 [&_code]:px-1 [&_code]:py-0.5 [&_a]:underline [&_a]:underline-offset-2";

  useEffect(() => {
    setFaviconIndex(getCachedFaviconIndex(faviconCacheKey));
  }, [faviconCacheKey]);

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

  useEffect(() => {
    if (isExpanded) {
      // Show full content immediately when expanding so it's visible during the animation.
      setShowFullContent(true);
    }
    // When collapsing, keep showFullContent=true until the transition ends
    // (handled in handleContentTransitionEnd) so the text doesn't flash
    // before the height animation closes.
  }, [isExpanded]);

  const toggleExpanded = () => {
    onToggle();
  };

  const handleContentTransitionEnd = () => {
    // Only hide full content once the collapse animation has fully completed.
    // Guard against the case where heights are equal (no transitionend fires).
    if (!isExpanded) {
      setShowFullContent(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    toggleExpanded();
  };

  return (
    <motion.article
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={toggleExpanded}
      onKeyDown={handleKeyDown}
      className={`group relative flex flex-col rounded-xl border bg-card/40 transition-all duration-300 hover:bg-card/70 ${isExpanded ? "p-4" : "p-3"}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      whileHover={{ y: -2, scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      layout
    >
      <div className="space-y-2 pr-7">
          <div className={`flex items-center gap-2 text-muted-foreground/60 transition-all duration-300 ${isExpanded ? "text-xs" : "text-[11px]"}`}>
          <CalendarDays className="size-3" />
          {new Date(article.publicationDate ?? Date.now()).toLocaleDateString()}
          <span className="text-border">|</span>
          {showFavicon && faviconUrl ? (
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
          ) : null}
          <span className="truncate">{getArticleSourceLabel(article)}</span>
        </div>
        <h3 className={`font-medium leading-snug transition-all duration-300 ${isExpanded ? "text-base" : "line-clamp-2 text-sm"}`}>
          {article.title}
        </h3>
        {isHydrating ? (
          <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
            <Loader2 className="size-3 animate-spin" />
            Fetching full text…
          </div>
        ) : null}

        <div>
          <div
            className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
            onTransitionEnd={handleContentTransitionEnd}
            style={{
              maxHeight: hasOverflow
                ? `${isExpanded ? expandedHeight : collapsedHeight}px`
                : "none",
              // If heights are equal the browser won't fire transitionend; hide directly.
              ...(hasOverflow && collapsedHeight === expandedHeight && !isExpanded
                ? { maxHeight: `${collapsedHeight}px` }
                : {}),
            }}
          >
            {hasOverflow && !showFullContent ? (
              <p className="text-xs leading-relaxed text-muted-foreground/75">
                {`${preview}…`}
              </p>
            ) : useRichFormatting ? (
              <div
                className={`${richContentClassName} transition-[color,font-size] duration-300`}
                dangerouslySetInnerHTML={{ __html: article.content || "" }}
              />
            ) : (
              <p className={`leading-relaxed transition-all duration-300 ${isExpanded ? "text-sm text-foreground/70" : "text-xs text-muted-foreground/75"}`}>
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
              <p className="text-xs leading-relaxed text-muted-foreground/75">
                {content}
              </p>
            )}
          </div>
        </div>
      </div>

      <motion.a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Open article"
        className="absolute bottom-2 right-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors duration-200 hover:text-foreground"
        whileHover={{ scale: 1.08, rotate: -3 }}
        whileTap={{ scale: 0.95 }}
      >
        <ArrowUpRight className="size-3.5" />
      </motion.a>
    </motion.article>
  );
};
