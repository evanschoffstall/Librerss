import { type CategoryTreeNode } from "@/src/lib";
import { Globe } from "lucide-react";

interface FeedCategoryProps {
  category: CategoryTreeNode;
  isActive: boolean;
  onClick: () => void;
}

const getHostname = (url?: string) => {
  if (!url) return "No source URL";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export const FeedCategory = ({ category, isActive, onClick }: FeedCategoryProps) => (
  <button
    onClick={onClick}
    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
      isActive
        ? "bg-muted/80 text-foreground"
        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
    }`}
  >
    <div className="min-w-0">
      <p className="text-sm font-medium leading-5">{category.label}</p>
      <p className="truncate text-[11px] text-muted-foreground/60">
        {getHostname(category.data?.url)}
      </p>
    </div>
    <Globe className="size-3.5 shrink-0 text-muted-foreground/40" />
  </button>
);
