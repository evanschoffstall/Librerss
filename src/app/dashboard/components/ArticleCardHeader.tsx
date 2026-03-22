import { ArrowUpRight, CalendarDays, Circle, CircleCheck, Code, Globe, Mail, Share2, Star } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Article, formatRelativeDate } from "@/lib";

import { getArticleSourceLabel } from "../services/article-content";
import { setCachedFaviconIndex } from "../services/favicons";

const ICON_SPRING = { damping: 22, stiffness: 320, type: "spring" as const };

interface ArticleCardHeaderProps {
  article: Article;
  articleActionControlProps: {
    onPointerDown: (event: React.SyntheticEvent) => void;
    onPointerUp: (event: React.SyntheticEvent) => void;
  };
  collapsedTitleClassName: string;
  encodedShareTitle: string;
  encodedShareUrl: string;
  faviconCacheKey: string;
  faviconCandidates: string[];
  faviconIndex: number;
  faviconTint: { background: string; foreground: string };
  faviconUrl: null | string;
  gradientCls: string;
  headerGradientOverlayRef: React.RefObject<HTMLDivElement | null>;
  headerSwipeZoneRef: (element: HTMLDivElement | null) => void;
  iconBtnCls: string;
  iconLinkCls: string;
  isDevelopment: boolean;
  isMobile: boolean;
  isShareMenuOpen: boolean;
  isUpdatingState: boolean;
  onCopyLinkOpen: () => void;
  onRawHtmlOpen: () => void;
  onShare: (event: React.MouseEvent<HTMLButtonElement>) => Promise<void>;
  onShareMenuOpenChange: (open: boolean) => void;
  onToggleRead: (article: Article) => void;
  onToggleStarred: (article: Article) => void;
  setFaviconIndex: React.Dispatch<React.SetStateAction<number>>;
  shareUrl: string;
  showFavicon: boolean;
  supportsNativeShare: boolean;
  visuallyExpanded: boolean;
}

export function ArticleCardHeader({
  article,
  articleActionControlProps,
  collapsedTitleClassName,
  encodedShareTitle,
  encodedShareUrl,
  faviconCacheKey,
  faviconCandidates,
  faviconIndex,
  faviconTint,
  faviconUrl,
  gradientCls,
  headerGradientOverlayRef,
  headerSwipeZoneRef,
  iconBtnCls,
  iconLinkCls,
  isDevelopment,
  isMobile,
  isShareMenuOpen,
  isUpdatingState,
  onCopyLinkOpen,
  onRawHtmlOpen,
  onShare,
  onShareMenuOpenChange,
  onToggleRead,
  onToggleStarred,
  setFaviconIndex,
  shareUrl,
  showFavicon,
  supportsNativeShare,
  visuallyExpanded,
}: ArticleCardHeaderProps) {
  return (
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
        transition: "padding 250ms cubic-bezier(0.25, 1, 0.5, 1)",
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
        <div className={gradientCls} ref={headerGradientOverlayRef} />
      </div>
      <div className="relative z-10 space-y-2">
        <div
          className="
            flex items-center gap-2 text-xs/5 tracking-normal
            text-muted-foreground/70 select-none
          "
        >
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
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
                      const resolved = next < faviconCandidates.length ? next : -1;
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
            <span className="truncate">{getArticleSourceLabel(article)}</span>
          </div>

          <div
            className={`
              -mr-1 ml-auto flex shrink-0 items-center gap-1 transition-opacity
              duration-150
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
              aria-label={article.isRead ? "Mark as unread" : "Mark as read"}
              {...articleActionControlProps}
              className={iconBtnCls}
              disabled={isUpdatingState}
              onClick={(event) => {
                event.stopPropagation();
                onToggleRead(article);
              }}
              type="button"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {article.isRead ? (
                  <motion.span
                    animate={{ opacity: 1, scale: 1 }}
                    className="inline-flex"
                    exit={{ opacity: 0, scale: 0.75 }}
                    initial={{ opacity: 0, scale: 0.75 }}
                    key="read"
                    transition={ICON_SPRING}
                  >
                    <CircleCheck
                      className="
                        size-3.5 text-emerald-500/70
                        dark:text-emerald-400/60
                      "
                    />
                  </motion.span>
                ) : (
                  <motion.span
                    animate={{ opacity: 1, scale: 1 }}
                    className="inline-flex"
                    exit={{ opacity: 0, scale: 0.75 }}
                    initial={{ opacity: 0, scale: 0.75 }}
                    key="unread"
                    transition={ICON_SPRING}
                  >
                    <Circle className="size-3.5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>

            <button
              aria-label={article.isStarred ? "Remove star" : "Star article"}
              {...articleActionControlProps}
              className={iconBtnCls}
              disabled={isUpdatingState}
              onClick={(event) => {
                event.stopPropagation();
                onToggleStarred(article);
              }}
              type="button"
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  animate={{ opacity: 1, scale: 1 }}
                  className="inline-flex"
                  exit={{ opacity: 0, scale: 0.75 }}
                  initial={{ opacity: 0, scale: 0.75 }}
                  key={article.isStarred ? "starred" : "unstarred"}
                  transition={ICON_SPRING}
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
                </motion.span>
              </AnimatePresence>
            </button>

            {supportsNativeShare ? (
              <button
                aria-label="Share article"
                {...articleActionControlProps}
                className={iconBtnCls}
                onClick={(event) => {
                  void onShare(event);
                }}
                type="button"
              >
                <Share2 className="size-3.5" />
              </button>
            ) : (
              <DropdownMenu onOpenChange={onShareMenuOpenChange} open={isShareMenuOpen}>
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
                      onShareMenuOpenChange(false);
                      onCopyLinkOpen();
                    }}
                  >
                    Copy link
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    onSelect={() => {
                      onShareMenuOpenChange(false);
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
                      onShareMenuOpenChange(false);
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
                      onShareMenuOpenChange(false);
                    }}
                  >
                    <a
                      href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`${article.title} ${shareUrl}`.trim())}`}
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
                  onRawHtmlOpen();
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
              onClick={(event) => {
                event.stopPropagation();
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
                : collapsedTitleClassName
            }
          `}
        >
          {article.title}
        </h3>
      </div>
      {visuallyExpanded && <div className="mt-3 border-t border-border/20" />}
    </div>
  );
}