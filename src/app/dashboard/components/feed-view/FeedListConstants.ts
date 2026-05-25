import { type CollapsingArticles } from "@/app/dashboard/display-types";

export const EMPTY_COLLAPSING_ARTICLES: Readonly<CollapsingArticles> = {};
/**
 * Return the empty pre-expand viewport snapshot when callers do not provide one.
 * @returns A null viewport snapshot.
 */
export const EMPTY_PRE_EXPAND_VIEWPORT_SNAPSHOT = () => null;
export const FEED_DEFAULT_ITEM_HEIGHT_PX = 120;
export const FEED_LIST_FRAME_CLASSNAME =
  "flex h-full min-h-0 w-full min-w-0 flex-col";
export const FEED_LIST_SURFACE_CLASSNAME =
  "flex min-h-0 w-full min-w-0 flex-col";
export const FEED_VIRTUALIZER_CLASSNAME = "w-full min-w-0 flex-none";
export const FEED_LIST_FILL_STYLE = { height: "100%" } as const;
export const CONTENT_ENTER_TRANSITION = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1] as const,
};
export const IS_INVERTED_SCROLL_FEATURE_ENABLED_IN_RUNTIME =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
