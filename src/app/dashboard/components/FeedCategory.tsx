import { type CategoryTreeNode } from "@/lib";
import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getCachedFaviconIndex,
  getFaviconCacheKey,
  getFaviconCandidates,
  getFaviconTintColors,
  getHostnameLabel,
  setCachedFaviconIndex,
} from "../utils/favicons";

interface FeedCategoryProps {
  category: CategoryTreeNode;
  isActive: boolean;
  onClick: () => void;
  showFavicon: boolean;
}

export const FeedCategory = ({ category, isActive, onClick, showFavicon }: FeedCategoryProps) => {
  const faviconCandidates = getFaviconCandidates(category.data?.url);
  const faviconCacheKey = getFaviconCacheKey(category.data?.url);
  const [faviconIndex, setFaviconIndex] = useState(() => getCachedFaviconIndex(faviconCacheKey));
  const faviconUrl = faviconIndex >= 0 ? faviconCandidates[faviconIndex] : undefined;
  const faviconTint = getFaviconTintColors(category.data?.url);

  useEffect(() => {
    setFaviconIndex(getCachedFaviconIndex(faviconCacheKey));
  }, [faviconCacheKey]);

  const shouldShowFavicon = showFavicon && Boolean(faviconUrl);

  return (
    <motion.button
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${isActive
        ? "bg-muted/80 text-foreground"
        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        }`}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium leading-5">{category.label}</p>
        <p className="truncate text-[11px] text-muted-foreground/60">
          {getHostnameLabel(category.data?.url)}
        </p>
      </div>
      {shouldShowFavicon ? (
        <img
          src={faviconUrl ?? ""}
          alt=""
          className="size-3.5 shrink-0 rounded-sm"
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
          className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: faviconTint.background }}
          aria-hidden="true"
        >
          <Globe className="size-2.5" style={{ color: faviconTint.foreground }} />
        </span>
      )}
    </motion.button>
  );
};
