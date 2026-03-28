import { SettingsAccountSection } from "@/app/dashboard/components/settings/SettingsAccountSection";
import { type CategoryTreeNode } from "@/lib";

import type { SettingsModalState } from "../../hooks/useSettingsModalState";

import {
  SettingsDisplaySection,
  type SettingsDisplaySectionProps,
} from "./SettingsDisplaySection";
import { SettingsFeedManagementSection } from "./SettingsFeedManagementSection";
import { SettingsPreviewSection } from "./SettingsPreviewSection";
import { SettingsProxySection } from "./SettingsProxySection";

export interface SettingsSectionsProps extends SettingsDisplaySectionProps {
  categories: CategoryTreeNode[];
  isPreviewMode?: boolean;
  onAccountDeleted: () => void;
  onRemoveCategory: (label: string) => Promise<boolean>;
  pendingCategoryRemovalLabel: null | string;
  state: SettingsModalState;
}

/**
 * Renders the shared settings sections used by both the tabbed panel and the
 * legacy scrollable modal surface.
 */
export function SettingsSections({
  articlesPerPage,
  autoRefreshIntervalMinutes,
  backgroundMode,
  categories,
  distillStrategy,
  isPreviewMode = false,
  onAccountDeleted,
  onArticlesPerPageChange,
  onAutoRefreshIntervalMinutesChange,
  onBackgroundModeChange,
  onDistillStrategyChange,
  onRemoveCategory,
  onShowFaviconsChange,
  pendingCategoryRemovalLabel,
  showFavicons,
  state,
}: SettingsSectionsProps) {
  return (
    <div className="space-y-4 py-1 pr-3">
      <SettingsDisplaySection
        articlesPerPage={articlesPerPage}
        autoRefreshIntervalMinutes={autoRefreshIntervalMinutes}
        backgroundMode={backgroundMode}
        distillStrategy={distillStrategy}
        onArticlesPerPageChange={onArticlesPerPageChange}
        onAutoRefreshIntervalMinutesChange={onAutoRefreshIntervalMinutesChange}
        onBackgroundModeChange={onBackgroundModeChange}
        onDistillStrategyChange={onDistillStrategyChange}
        onShowFaviconsChange={onShowFaviconsChange}
        showFavicons={showFavicons}
      />

      <SettingsFeedManagementSection
        categories={categories}
        isPreviewMode={isPreviewMode}
        onRemoveCategory={onRemoveCategory}
        pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
        state={state}
      />

      <SettingsPreviewSection isPreviewMode={isPreviewMode}>
        <SettingsProxySection />
      </SettingsPreviewSection>

      {!isPreviewMode && (
        <SettingsAccountSection onAccountDeleted={onAccountDeleted} />
      )}
    </div>
  );
}