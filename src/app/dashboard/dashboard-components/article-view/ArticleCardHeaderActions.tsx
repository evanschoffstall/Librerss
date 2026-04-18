import {
  ArrowUpRight,
  Circle,
  CircleCheck,
  Code,
  Mail,
  Share2,
  Star,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { Article } from "@/lib/core";

import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ICON_SPRING = { damping: 22, stiffness: 320, type: "spring" as const };

export interface ArticleActionControlProps {
  onPointerDown: (event: React.SyntheticEvent) => void;
  onPointerUp: (event: React.SyntheticEvent) => void;
}

export interface ArticleHeaderActionsProps {
  article: Article;
  articleActionControlProps: ArticleActionControlProps;
  encodedShareTitle: string;
  encodedShareUrl: string;
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
  shareUrl: string;
  supportsNativeShare: boolean;
  visuallyExpanded: boolean;
}

/**
 * @param props
 */
export function ArticleHeaderActions(props: ArticleHeaderActionsProps) {
  return (
    <div
      className={resolveArticleHeaderActionsClassName(
        props.visuallyExpanded,
        props.isMobile,
      )}
    >
      <ArticleReadToggleButton
        article={props.article}
        articleActionControlProps={props.articleActionControlProps}
        iconBtnCls={props.iconBtnCls}
        isUpdatingState={props.isUpdatingState}
        onToggleRead={props.onToggleRead}
      />
      <ArticleStarToggleButton
        article={props.article}
        articleActionControlProps={props.articleActionControlProps}
        iconBtnCls={props.iconBtnCls}
        isUpdatingState={props.isUpdatingState}
        onToggleStarred={props.onToggleStarred}
      />
      <ArticleShareAction
        article={props.article}
        articleActionControlProps={props.articleActionControlProps}
        encodedShareTitle={props.encodedShareTitle}
        encodedShareUrl={props.encodedShareUrl}
        iconBtnCls={props.iconBtnCls}
        isShareMenuOpen={props.isShareMenuOpen}
        onCopyLinkOpen={props.onCopyLinkOpen}
        onShare={props.onShare}
        onShareMenuOpenChange={props.onShareMenuOpenChange}
        shareUrl={props.shareUrl}
        supportsNativeShare={props.supportsNativeShare}
      />
      <ArticleHeaderUtilityActions
        article={props.article}
        articleActionControlProps={props.articleActionControlProps}
        iconBtnCls={props.iconBtnCls}
        iconLinkCls={props.iconLinkCls}
        isDevelopment={props.isDevelopment}
        onRawHtmlOpen={props.onRawHtmlOpen}
      />
    </div>
  );
}

/**
 * @param root0
 * @param root0.article
 * @param root0.articleActionControlProps
 * @param root0.iconBtnCls
 * @param root0.iconLinkCls
 * @param root0.isDevelopment
 * @param root0.onRawHtmlOpen
 */
function ArticleHeaderUtilityActions({
  article,
  articleActionControlProps,
  iconBtnCls,
  iconLinkCls,
  isDevelopment,
  onRawHtmlOpen,
}: Pick<
  ArticleHeaderActionsProps,
  | "article"
  | "articleActionControlProps"
  | "iconBtnCls"
  | "iconLinkCls"
  | "isDevelopment"
  | "onRawHtmlOpen"
>) {
  return (
    <>
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
    </>
  );
}

/**
 * @param root0
 * @param root0.article
 * @param root0.articleActionControlProps
 * @param root0.iconBtnCls
 * @param root0.isUpdatingState
 * @param root0.onToggleRead
 */
function ArticleReadToggleButton({
  article,
  articleActionControlProps,
  iconBtnCls,
  isUpdatingState,
  onToggleRead,
}: Pick<
  ArticleHeaderActionsProps,
  | "article"
  | "articleActionControlProps"
  | "iconBtnCls"
  | "isUpdatingState"
  | "onToggleRead"
>) {
  return (
    <button
      aria-label={article.isRead ? "Mark as unread" : "Mark as read"}
      className={iconBtnCls}
      disabled={isUpdatingState}
      onClick={(event) => {
        event.stopPropagation();
        onToggleRead(article);
      }}
      onPointerDown={(event) => {
        articleActionControlProps.onPointerDown(event);
        window.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.ARTICLE_READ_TOGGLE_START, {
            detail: { articleKey: getArticleKey(article) },
          }),
        );
      }}
      onPointerUp={articleActionControlProps.onPointerUp}
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
  );
}

/**
 * @param root0
 * @param root0.article
 * @param root0.articleActionControlProps
 * @param root0.encodedShareTitle
 * @param root0.encodedShareUrl
 * @param root0.iconBtnCls
 * @param root0.isShareMenuOpen
 * @param root0.onCopyLinkOpen
 * @param root0.onShare
 * @param root0.onShareMenuOpenChange
 * @param root0.shareUrl
 * @param root0.supportsNativeShare
 */
function ArticleShareAction({
  article,
  articleActionControlProps,
  encodedShareTitle,
  encodedShareUrl,
  iconBtnCls,
  isShareMenuOpen,
  onCopyLinkOpen,
  onShare,
  onShareMenuOpenChange,
  shareUrl,
  supportsNativeShare,
}: Pick<
  ArticleHeaderActionsProps,
  | "article"
  | "articleActionControlProps"
  | "encodedShareTitle"
  | "encodedShareUrl"
  | "iconBtnCls"
  | "isShareMenuOpen"
  | "onCopyLinkOpen"
  | "onShare"
  | "onShareMenuOpenChange"
  | "shareUrl"
  | "supportsNativeShare"
>) {
  return supportsNativeShare ? (
    <NativeShareButton
      articleActionControlProps={articleActionControlProps}
      iconBtnCls={iconBtnCls}
      onShare={onShare}
    />
  ) : (
    <ArticleShareMenu
      article={article}
      articleActionControlProps={articleActionControlProps}
      encodedShareTitle={encodedShareTitle}
      encodedShareUrl={encodedShareUrl}
      iconBtnCls={iconBtnCls}
      isShareMenuOpen={isShareMenuOpen}
      onCopyLinkOpen={onCopyLinkOpen}
      onShareMenuOpenChange={onShareMenuOpenChange}
      shareUrl={shareUrl}
    />
  );
}

/**
 * @param root0
 * @param root0.article
 * @param root0.articleActionControlProps
 * @param root0.encodedShareTitle
 * @param root0.encodedShareUrl
 * @param root0.iconBtnCls
 * @param root0.isShareMenuOpen
 * @param root0.onCopyLinkOpen
 * @param root0.onShareMenuOpenChange
 * @param root0.shareUrl
 */
function ArticleShareMenu({
  article,
  articleActionControlProps,
  encodedShareTitle,
  encodedShareUrl,
  iconBtnCls,
  isShareMenuOpen,
  onCopyLinkOpen,
  onShareMenuOpenChange,
  shareUrl,
}: Pick<
  ArticleHeaderActionsProps,
  | "article"
  | "articleActionControlProps"
  | "encodedShareTitle"
  | "encodedShareUrl"
  | "iconBtnCls"
  | "isShareMenuOpen"
  | "onCopyLinkOpen"
  | "onShareMenuOpenChange"
  | "shareUrl"
>) {
  return (
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
        <ArticleShareMenuLink
          href={`mailto:?subject=${encodedShareTitle}&body=${encodedShareUrl}`}
          icon={<Mail className="size-3.5" />}
          label="Email"
          onShareMenuOpenChange={onShareMenuOpenChange}
        />
        <ArticleShareMenuLink
          href={`https://www.reddit.com/submit?url=${encodedShareUrl}&title=${encodedShareTitle}`}
          label="Share to Reddit"
          onShareMenuOpenChange={onShareMenuOpenChange}
        />
        <ArticleShareMenuLink
          href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`${article.title} ${shareUrl}`.trim())}`}
          label="Share to Bluesky"
          onShareMenuOpenChange={onShareMenuOpenChange}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * @param root0
 * @param root0.href
 * @param root0.icon
 * @param root0.label
 * @param root0.onShareMenuOpenChange
 */
function ArticleShareMenuLink({
  href,
  icon,
  label,
  onShareMenuOpenChange,
}: {
  href: string;
  icon?: React.ReactNode;
  label: string;
  onShareMenuOpenChange: (open: boolean) => void;
}) {
  return (
    <DropdownMenuItem
      asChild
      onSelect={() => {
        onShareMenuOpenChange(false);
      }}
    >
      <a href={href} rel="noopener noreferrer" target="_blank">
        {icon}
        {label}
      </a>
    </DropdownMenuItem>
  );
}

/**
 * @param root0
 * @param root0.article
 * @param root0.articleActionControlProps
 * @param root0.iconBtnCls
 * @param root0.isUpdatingState
 * @param root0.onToggleStarred
 */
function ArticleStarToggleButton({
  article,
  articleActionControlProps,
  iconBtnCls,
  isUpdatingState,
  onToggleStarred,
}: Pick<
  ArticleHeaderActionsProps,
  | "article"
  | "articleActionControlProps"
  | "iconBtnCls"
  | "isUpdatingState"
  | "onToggleStarred"
>) {
  return (
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
            className={
              article.isStarred
                ? `
                  size-3.5 fill-current text-amber-400/90
                  dark:text-amber-300/80
                `
                : "size-3.5"
            }
          />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/**
 * @param root0
 * @param root0.articleActionControlProps
 * @param root0.iconBtnCls
 * @param root0.onShare
 */
function NativeShareButton({
  articleActionControlProps,
  iconBtnCls,
  onShare,
}: Pick<
  ArticleHeaderActionsProps,
  "articleActionControlProps" | "iconBtnCls" | "onShare"
>) {
  return (
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
  );
}

/**
 * @param visuallyExpanded
 * @param isMobile
 */
function resolveArticleHeaderActionsClassName(
  visuallyExpanded: boolean,
  isMobile: boolean,
) {
  return [
    "-mr-1 ml-auto flex shrink-0 items-center gap-1 transition-opacity duration-150",
    visuallyExpanded || isMobile
      ? "opacity-100"
      : "opacity-0 group-hover:opacity-100",
  ].join(" ");
}
