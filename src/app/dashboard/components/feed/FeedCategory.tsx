import { type CategoryTreeNode } from "@/lib";
import { getUrlHostnameLabel } from "@/lib/utils/url";
import { Globe } from "lucide-react";
import { setCachedFaviconIndex } from "../../helpers/favicons";
import { useFavicon } from "../../hooks/useFavicon";

interface FeedCategoryProps {
  category: CategoryTreeNode;
  isActive: boolean;
  onClick: () => void;
  showFavicon: boolean;
}

export const FeedCategory = ({ category, isActive, onClick, showFavicon }: FeedCategoryProps) => {
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
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${isActive
        ? "bg-muted/80 text-foreground"
        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        }`}
    >
      <div className="min-w-0">
        <p className="text-[0.93rem] font-medium leading-[1.3] tracking-[0.005em]">
          {category.label}
        </p>
        <p className="truncate text-xs leading-4 text-muted-foreground/65">
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
          <Globe className="size-2.5" style={{ color: faviconTint.foreground }} />
        </span>
      )}
    </button>
  );
};
