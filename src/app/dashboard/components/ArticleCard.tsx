import { type Article } from "@/src/lib";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

interface ArticleCardProps {
  article: Article;
  isExpanded: boolean;
  onToggle: () => void;
}

const toPlainText = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

const getHostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export const ArticleCard = ({ article, isExpanded, onToggle }: ArticleCardProps) => {
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
  const [showFullContent, setShowFullContent] = useState(isExpanded);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [expandedHeight, setExpandedHeight] = useState(0);
  const previewRef = useRef<HTMLParagraphElement>(null);
  const fullContentRef = useRef<HTMLParagraphElement>(null);

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
  }, [content, preview]);

  useEffect(() => {
    if (isExpanded) {
      setShowFullContent(true);
    }
  }, [isExpanded]);

  const toggleExpanded = () => {
    if (!hasOverflow) {
      return;
    }

    onToggle();
  };

  const handleContentTransitionEnd = () => {
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
    <article
      role={hasOverflow ? "button" : undefined}
      tabIndex={hasOverflow ? 0 : undefined}
      aria-expanded={hasOverflow ? isExpanded : undefined}
      onClick={toggleExpanded}
      onKeyDown={handleKeyDown}
      className="group relative flex flex-col rounded-xl border bg-card/40 p-3 transition-all duration-300 hover:bg-card/70"
    >
      <div className="space-y-2 pr-7">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
          <CalendarDays className="size-3" />
          {new Date(article.publication_date || Date.now()).toLocaleDateString()}
          <span className="text-border">|</span>
          <span className="truncate">{getHostname(article.link)}</span>
        </div>
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">
          {article.title}
        </h3>

        <div>
          <div
            className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
            onTransitionEnd={handleContentTransitionEnd}
            style={{
              maxHeight: hasOverflow
                ? `${isExpanded ? expandedHeight : collapsedHeight}px`
                : "none",
            }}
          >
            <p className="text-xs leading-relaxed text-muted-foreground/75">
              {hasOverflow && !showFullContent ? `${preview}…` : content}
            </p>
          </div>
          <p
            ref={previewRef}
            aria-hidden="true"
            className="pointer-events-none h-0 overflow-hidden opacity-0 text-xs leading-relaxed"
          >
            {`${preview}…`}
          </p>
          <p
            ref={fullContentRef}
            aria-hidden="true"
            className="pointer-events-none h-0 overflow-hidden opacity-0 text-xs leading-relaxed"
          >
            {content}
          </p>
        </div>
      </div>

      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Open article"
        className="absolute bottom-2 right-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors duration-200 hover:text-foreground"
      >
        <ArrowUpRight className="size-3.5" />
      </a>
    </article>
  );
};
