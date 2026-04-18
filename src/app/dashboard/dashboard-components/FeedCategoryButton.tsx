"use client";

import { Globe } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { memo } from "react";

import type { CategoryTreeNode } from "@/lib/core";

import { useArticleFavicon } from "@/app/dashboard/dashboard-components/article-view/hooks";
import { setCachedFaviconIndex } from "@/app/dashboard/dashboard-services/favicon";
import { getUrlHostnameLabel } from "@/lib/utils";

export interface FeedCategoryButtonProps {
  category: CategoryTreeNode;
  fallbackIconClassName?: string;
  isActive: boolean;
  onClick: (node: CategoryTreeNode) => void;
  onPrefetch: (node: CategoryTreeNode) => void;
  showFavicon: boolean;
}

const FEED_CATEGORY_HOVER_TRANSITION = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1] as const,
};

export const FeedCategoryButton = memo(
  /**
   * @param root0
   * @param root0.category
   * @param root0.fallbackIconClassName
   * @param root0.isActive
   * @param root0.onClick
   * @param root0.onPrefetch
   * @param root0.showFavicon
   */
  function FeedCategoryButton({
    category,
    fallbackIconClassName = "size-2.5",
    isActive,
    onClick,
    onPrefetch,
    showFavicon,
  }: FeedCategoryButtonProps) {
    const shouldReduceMotion = useReducedMotion();
    const {
      faviconCacheKey,
      faviconCandidates,
      faviconIndex,
      faviconTint,
      faviconUrl,
      setFaviconIndex,
    } = useArticleFavicon({ primaryUrl: category.data?.url });
    const shouldShowFavicon = showFavicon && Boolean(faviconUrl);

    return (
      <motion.button
        animate={{ scale: 1, x: 0 }}
        className={`
        flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg
        border-l-2 p-2 text-left transition-colors
        ${
          isActive
            ? "border-primary/60 bg-muted/70 text-foreground"
            : `
        border-transparent text-muted-foreground
        hover:bg-muted/40 hover:text-foreground
      `
        }
      `}
        onClick={() => {
          onClick(category);
        }}
        onFocus={() => {
          onPrefetch(category);
        }}
        onMouseEnter={() => {
          onPrefetch(category);
        }}
        transition={FEED_CATEGORY_HOVER_TRANSITION}
        whileHover={
          shouldReduceMotion || isActive ? undefined : { scale: 1.01, x: 2 }
        }
        whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
      >
        <div className="min-w-0">
          <p
            className="
            font-sans text-[0.93rem] leading-[1.35] font-medium
            tracking-[-0.005em]
          "
          >
            {category.label}
          </p>
          <p
            className="
            truncate font-sans text-xs/5 tracking-[-0.004em]
            text-muted-foreground/65
          "
          >
            {getUrlHostnameLabel(category.data?.url)}
          </p>
        </div>
        {shouldShowFavicon ? (
          <img
            alt=""
            className="size-3.5 shrink-0 rounded-sm"
            loading="lazy"
            onError={() => {
              setFaviconIndex((current: number) => {
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
            src={faviconUrl ?? ""}
          />
        ) : (
          <span
            aria-hidden="true"
            className="
            inline-flex size-3.5 shrink-0 items-center justify-center
            rounded-full
          "
            style={{ backgroundColor: faviconTint.background }}
          >
            <Globe
              className={fallbackIconClassName}
              style={{ color: faviconTint.foreground }}
            />
          </span>
        )}
      </motion.button>
    );
  },
);
