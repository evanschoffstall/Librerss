import { CalendarDays, Globe } from "lucide-react";

import {
  ArticleHeaderActions,
  type ArticleHeaderActionsProps,
} from "@/app/dashboard/dashboard-components/article-view/ArticleCardHeaderActions";
import { getArticleSourceLabel } from "@/app/dashboard/dashboard-services/article";
import { setCachedFaviconIndex } from "@/app/dashboard/dashboard-services/favicon";
import { formatRelativeDate } from "@/lib/utils";

const EXPANDED_HEADER_STYLE = {
  backdropFilter: "blur(24px)",
  touchAction: "pan-y",
  transition:
    "padding 250ms cubic-bezier(0.25, 1, 0.5, 1), background-color 250ms cubic-bezier(0.25, 1, 0.5, 1), backdrop-filter 200ms ease-out, -webkit-backdrop-filter 200ms ease-out",
  userSelect: "none",
  WebkitBackdropFilter: "blur(24px)",
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
} as const;
const COLLAPSED_HEADER_STYLE = {
  backdropFilter: "none",
  touchAction: "pan-y",
  transition:
    "padding 250ms cubic-bezier(0.25, 1, 0.5, 1), background-color 250ms cubic-bezier(0.25, 1, 0.5, 1), backdrop-filter 200ms ease-out, -webkit-backdrop-filter 200ms ease-out",
  userSelect: "none",
  WebkitBackdropFilter: "none",
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
} as const;
const COLLAPSED_TITLE_STYLE = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
} as const;

/**
 * Describes the props for the article card header component.
 */
interface ArticleCardHeaderProps extends ArticleHeaderActionsProps {
  collapsedTitleClassName: string;
  faviconCacheKey: string;
  faviconCandidates: string[];
  faviconIndex: number;
  faviconTint: { background: string; foreground: string };
  faviconUrl: null | string;
  gradientCls: string;
  headerGradientOverlayRef: React.RefObject<HTMLDivElement | null>;
  headerSwipeZoneRef: (element: HTMLDivElement | null) => void;
  setFaviconIndex: React.Dispatch<React.SetStateAction<number>>;
  showFavicon: boolean;
}

/**
 * Describes the props for the article header date component.
 */
interface ArticleHeaderDateProps {
  publicationDate: Date | string;
}

/**
 * Describes the props for the article header source component.
 */
type ArticleHeaderSourceProps = Pick<
  ArticleCardHeaderProps,
  | "article"
  | "faviconCacheKey"
  | "faviconCandidates"
  | "faviconIndex"
  | "faviconTint"
  | "faviconUrl"
  | "setFaviconIndex"
  | "showFavicon"
>;
/**
 * Render the article card header component.
 * @param props - The component props.
 * @returns The rendered article card header component.
 */
export function ArticleCardHeader(props: ArticleCardHeaderProps) {
  return (
    <div
      className={resolveArticleHeaderClassName(props.visuallyExpanded)}
      data-article-swipe-zone="header"
      ref={props.headerSwipeZoneRef}
      style={
        props.visuallyExpanded ? EXPANDED_HEADER_STYLE : COLLAPSED_HEADER_STYLE
      }
    >
      <ArticleHeaderGradient
        gradientCls={props.gradientCls}
        headerGradientOverlayRef={props.headerGradientOverlayRef}
      />
      <div className="relative z-10 space-y-2">
        <ArticleHeaderMetaRow {...props} />
        <ArticleHeaderTitle
          article={props.article}
          collapsedTitleClassName={props.collapsedTitleClassName}
          visuallyExpanded={props.visuallyExpanded}
        />
      </div>
      {props.visuallyExpanded ? (
        <div className="mt-3 border-t border-border/20" />
      ) : null}
    </div>
  );
}

/**
 * Render the article header date component.
 * @param props - The component props.
 * @returns The rendered article header date component.
 */
function ArticleHeaderDate(props: ArticleHeaderDateProps) {
  const { publicationDate } = props;
  return (
    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
      <CalendarDays className="size-3" />
      {formatRelativeDate(new Date(publicationDate))}
      <span
        aria-hidden="true"
        className="size-1 shrink-0 rounded-full bg-border/80"
      />
    </div>
  );
}

/**
 * Render the article header favicon component.
 * @param props - The component props.
 * @returns The rendered article header favicon component.
 */
function ArticleHeaderFavicon(
  props: Pick<
    ArticleCardHeaderProps,
    | "faviconCacheKey"
    | "faviconCandidates"
    | "faviconIndex"
    | "faviconTint"
    | "faviconUrl"
    | "setFaviconIndex"
  >,
) {
  const {
    faviconCacheKey,
    faviconCandidates,
    faviconIndex,
    faviconTint,
    faviconUrl,
    setFaviconIndex,
  } = props;
  if (!faviconUrl) {
    return (
      <span
        aria-hidden="true"
        className="
          inline-flex size-3 shrink-0 items-center justify-center rounded-full
        "
        style={{ backgroundColor: faviconTint.background }}
      >
        <Globe className="size-2" style={{ color: faviconTint.foreground }} />
      </span>
    );
  }

  return (
    <img
      alt=""
      className="size-3 rounded-sm bg-white/0 object-contain"
      decoding="sync"
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
  );
}

/**
 * Render the article header gradient component.
 * @param props - The component props.
 * @returns The rendered article header gradient component.
 */
function ArticleHeaderGradient(
  props: Pick<
    ArticleCardHeaderProps,
    "gradientCls" | "headerGradientOverlayRef"
  >,
) {
  const { gradientCls, headerGradientOverlayRef } = props;
  return (
    <div
      className="
        pointer-events-none absolute inset-0 overflow-hidden rounded-t-xl
      "
    >
      <div className={gradientCls} ref={headerGradientOverlayRef} />
    </div>
  );
}

/**
 * Render the article header meta row component.
 * @param props - The component props.
 * @returns The rendered article header meta row component.
 */
function ArticleHeaderMetaRow(props: ArticleCardHeaderProps) {
  return (
    <div
      className="
        flex items-center gap-2 text-xs/5 tracking-normal
        text-muted-foreground/70 select-none
      "
    >
      <ArticleHeaderDate publicationDate={props.article.publicationDate} />
      <ArticleHeaderSource
        article={props.article}
        faviconCacheKey={props.faviconCacheKey}
        faviconCandidates={props.faviconCandidates}
        faviconIndex={props.faviconIndex}
        faviconTint={props.faviconTint}
        faviconUrl={props.faviconUrl}
        setFaviconIndex={props.setFaviconIndex}
        showFavicon={props.showFavicon}
      />
      <ArticleHeaderActions {...resolveArticleHeaderActionsProps(props)} />
    </div>
  );
}

/**
 * Render the article header source component.
 * @param props - The component props.
 * @returns The rendered article header source component.
 */
function ArticleHeaderSource(props: ArticleHeaderSourceProps) {
  const {
    article,
    faviconCacheKey,
    faviconCandidates,
    faviconIndex,
    faviconTint,
    faviconUrl,
    setFaviconIndex,
    showFavicon,
  } = props;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {showFavicon ? (
        <ArticleHeaderFavicon
          faviconCacheKey={faviconCacheKey}
          faviconCandidates={faviconCandidates}
          faviconIndex={faviconIndex}
          faviconTint={faviconTint}
          faviconUrl={faviconUrl}
          setFaviconIndex={setFaviconIndex}
        />
      ) : null}
      <span className="truncate">{getArticleSourceLabel(article)}</span>
    </div>
  );
}

/**
 * Render the article header title component.
 * @param props - The component props.
 * @returns The rendered article header title component.
 */
function ArticleHeaderTitle(
  props: Pick<
    ArticleCardHeaderProps,
    "article" | "collapsedTitleClassName" | "visuallyExpanded"
  >,
) {
  const { article, collapsedTitleClassName, visuallyExpanded } = props;
  return (
    <h3
      className={[
        "font-sans tracking-[-0.015em] text-foreground antialiased select-none",
        visuallyExpanded
          ? "text-[1.125rem] leading-[1.35] font-bold"
          : collapsedTitleClassName,
      ].join(" ")}
      style={visuallyExpanded ? undefined : COLLAPSED_TITLE_STYLE}
    >
      {article.title}
    </h3>
  );
}

/**
 * Resolve the article header actions props.
 * @param props - The component props.
 * @returns The article header actions props.
 */
function resolveArticleHeaderActionsProps(
  props: ArticleCardHeaderProps,
): ArticleHeaderActionsProps {
  return {
    article: props.article,
    articleActionControlProps: props.articleActionControlProps,
    encodedShareTitle: props.encodedShareTitle,
    encodedShareUrl: props.encodedShareUrl,
    iconBtnCls: props.iconBtnCls,
    iconLinkCls: props.iconLinkCls,
    isDevelopment: props.isDevelopment,
    isMobile: props.isMobile,
    isShareMenuOpen: props.isShareMenuOpen,
    isUpdatingState: props.isUpdatingState,
    onCopyLinkOpen: props.onCopyLinkOpen,
    onRawHtmlOpen: props.onRawHtmlOpen,
    onShare: props.onShare,
    onShareMenuOpenChange: props.onShareMenuOpenChange,
    onToggleRead: props.onToggleRead,
    onToggleStarred: props.onToggleStarred,
    shareUrl: props.shareUrl,
    supportsNativeShare: props.supportsNativeShare,
    visuallyExpanded: props.visuallyExpanded,
  };
}

/**
 * Resolve the article header class name.
 * @param visuallyExpanded - The visually expanded.
 * @returns The article header class name.
 */
function resolveArticleHeaderClassName(visuallyExpanded: boolean) {
  return visuallyExpanded
    ? "relative sticky top-0 z-50 rounded-t-xl bg-card/85 px-4 pt-4"
    : "relative rounded-t-xl bg-card/70 px-3 pt-3";
}
