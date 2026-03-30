import { type CategoryTreeNode, type OpmlFeedImportEntry } from "@/lib";

/** Shared feed-management mutations consumed by the dashboard settings hooks. */
export interface SettingsFeedStateOptions {
  categories: CategoryTreeNode[];
  onAddFeed: (name: string, url: string, category: string) => Promise<boolean>;
  onDropCategory: (label: string, targetIndex: number) => Promise<void>;
  onDropFeed: (
    key: string,
    targetCategory: string,
    targetIndex: number,
  ) => Promise<void>;
  onImportOpml: (entries: OpmlFeedImportEntry[]) => Promise<void>;
  onRemoveFeed: (key: string) => Promise<void>;
  onRenameFeed: (key: string, name: string, url: string) => Promise<boolean>;
  onSetFeedEnabled: (key: string, enabled: boolean) => Promise<boolean>;
  onUpdateFeedSettings: (
    key: string,
    settings: SettingsFeedUpdate,
  ) => Promise<boolean>;
  selectedCategory: string;
}

/** Mutable feed-source settings exposed by the dashboard settings surface. */
interface SettingsFeedUpdate {
  extractionDisabled?: boolean;
  proxyEnabled?: boolean;
}