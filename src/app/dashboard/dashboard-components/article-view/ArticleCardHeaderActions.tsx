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

interface ArticleShareMenuLinkProps {
  href: string;
  icon?: React.ReactNode;
  label: string;
  onShareMenuOpenChange: (open: boolean) => void;
}

/**
 * Render the article header actions component.
 * @param props - The component props.
 * @returns The rendered article header actions component.
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
 * Render the article header utility actions component.
 * @param props - The component props.
 * @returns The rendered article header utility actions component.
 */
function ArticleHeaderUtilityActions(
  props: Pick<
    ArticleHeaderActionsProps,
    | "article"
    | "articleActionControlProps"
    | "iconBtnCls"
    | "iconLinkCls"
    | "isDevelopment"
    | "onRawHtmlOpen"
  >,
) {
  const {
    article,
    articleActionControlProps,
    iconBtnCls,
    iconLinkCls,
    isDevelopment,
    onRawHtmlOpen,
  } = props;
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
 * Render the article read toggle button component.
 * @param props - The component props.
 * @returns The rendered article read toggle button component.
 */
function ArticleReadToggleButton(
  props: Pick<
    ArticleHeaderActionsProps,
    | "article"
    | "articleActionControlProps"
    | "iconBtnCls"
    | "isUpdatingState"
    | "onToggleRead"
  >,
) {
  const {
    article,
    articleActionControlProps,
    iconBtnCls,
    isUpdatingState,
    onToggleRead,
  } = props;
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
 * Render the article share action component.
 * @param props - The component props.
 * @returns The rendered article share action component.
 */
function ArticleShareAction(
  props: Pick<
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
  >,
) {
  const {
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
  } = props;
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
 * Render the article share menu component.
 * @param props - The component props.
 * @returns The rendered article share menu component.
 */
function ArticleShareMenu(
  props: Pick<
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
  >,
) {
  const {
    article,
    articleActionControlProps,
    encodedShareTitle,
    encodedShareUrl,
    iconBtnCls,
    isShareMenuOpen,
    onCopyLinkOpen,
    onShareMenuOpenChange,
    shareUrl,
  } = props;
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
 * Render the article share menu link component.
 * @param props - The component props.
 * @returns The rendered article share menu link component.
 */
function ArticleShareMenuLink(props: ArticleShareMenuLinkProps) {
  const { href, icon, label, onShareMenuOpenChange } = props;
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
 * Render the article star toggle button component.
 * @param props - The component props.
 * @returns The rendered article star toggle button component.
 */
function ArticleStarToggleButton(
  props: Pick<
    ArticleHeaderActionsProps,
    | "article"
    | "articleActionControlProps"
    | "iconBtnCls"
    | "isUpdatingState"
    | "onToggleStarred"
  >,
) {
  const {
    article,
    articleActionControlProps,
    iconBtnCls,
    isUpdatingState,
    onToggleStarred,
  } = props;
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
 * Render the native share button component.
 * @param props - The component props.
 * @returns The rendered native share button component.
 */
function NativeShareButton(
  props: Pick<
    ArticleHeaderActionsProps,
    "articleActionControlProps" | "iconBtnCls" | "onShare"
  >,
) {
  const { articleActionControlProps, iconBtnCls, onShare } = props;
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
 * Resolve the article header actions class name.
 * @param visuallyExpanded - The visually expanded.
 * @param isMobile - Whether is mobile.
 * @returns The article header actions class name.
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
