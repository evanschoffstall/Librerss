import { type CategoryTreeNode } from "@/lib";
import { getUrlHostnameLabel } from "@/lib/utils/url";
import { Globe } from "lucide-react";
import { memo } from "react";
import { useFavicon } from "../../hooks/useFavicon";
import { setCachedFaviconIndex } from "../../services/favicons";

interface FeedCategoryProps {
  category: CategoryTreeNode;
  isActive: boolean;
  onClick: (node: CategoryTreeNode) => void;
  showFavicon: boolean;
}

export const FeedCategory = memo(function FeedCategory({
  category,
  isActive,
  onClick,
  showFavicon,
}: FeedCategoryProps) {
  const {
    faviconUrl,
    faviconTint,
    faviconCacheKey,
    faviconIndex,
    faviconCandidates,
    setFaviconIndex,
  } = useFavicon({ primaryUrl: category.data?.url });

  const shouldShowFavicon = showFavicon && Boolean(faviconUrl);

  return (
    <button
      onClick={() => onClick(category)}
      className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-l-2 px-2 py-2 text-left transition-colors ${
        isActive
          ? "border-primary/60 bg-muted/70 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      }`}
    >
      <div className="min-w-0">
        <p className="font-sans text-[0.93rem] font-medium leading-[1.35] tracking-[-0.005em]">
          {category.label}
        </p>
        <p className="truncate font-sans text-xs leading-5 tracking-[-0.004em] text-muted-foreground/65">
          {getUrlHostnameLabel(category.data?.url)}
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
          <Globe
            className="size-2.5"
            style={{ color: faviconTint.foreground }}
          />
        </span>
      )}
    </button>
  );
});
