import { Download, Rss, Upload } from "lucide-react";

import type { SettingsModalState } from "@/app/dashboard/settings-state";
import type { CategoryTreeNode } from "@/lib/core";

import { SettingsCategoryList } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsCategoryList";
import { SettingsImportSkeleton } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsImportSkeleton";
import { SettingsPreviewSection } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsPreviewSection";
import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/lib/hooks";
import { generateOpml } from "@/lib/utils";

interface SettingsFeedManagementActionsProps {
  categories: CategoryTreeNode[];
  isImportingOpml: boolean;
  isMobile: boolean;
  onImportClick: () => void;
  onOpmlFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  opmlInputRef: SettingsModalState["opmlInputRef"];
}

interface SettingsFeedManagementSectionProps {
  categories: CategoryTreeNode[];
  isPreviewMode?: boolean;
  onRemoveCategory: (label: string) => Promise<boolean>;
  pendingCategoryRemovalLabel: null | string;
  showPreviewOverlay?: boolean;
  state: SettingsModalState;
}
/**
 * Render the settings feed management section component.
 * @param props - The component props.
 * @returns The rendered settings feed management section component.
 */
export function SettingsFeedManagementSection(
  props: SettingsFeedManagementSectionProps,
) {
  const {
    categories,
    isPreviewMode = false,
    onRemoveCategory,
    pendingCategoryRemovalLabel,
    showPreviewOverlay = true,
    state,
  } = props;
  const isMobile = useIsMobile();

  return (
    <SettingsPreviewSection
      isPreviewMode={isPreviewMode}
      showOverlay={showPreviewOverlay}
    >
      <section className="settings-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="section-heading">
              <Rss className="icon-muted" />
              Feeds
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Add, edit, organize, and import feed sources.
            </p>
          </div>
          <SettingsFeedManagementActions
            categories={categories}
            isImportingOpml={state.isImportingOpml}
            isMobile={isMobile}
            onImportClick={() => state.opmlInputRef.current?.click()}
            onOpmlFileChange={(event) => {
              void state.handleOpmlFileChange(event);
            }}
            opmlInputRef={state.opmlInputRef}
          />
        </div>

        <TooltipProvider delayDuration={300}>
          <SettingsFeedManagementList
            categories={categories}
            onRemoveCategory={onRemoveCategory}
            pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
            state={state}
          />
        </TooltipProvider>
      </section>
    </SettingsPreviewSection>
  );
}

/**
 * Render the settings feed management actions component.
 * @param props - The component props.
 * @returns The rendered settings feed management actions component.
 */
function SettingsFeedManagementActions(
  props: SettingsFeedManagementActionsProps,
) {
  const {
    categories,
    isImportingOpml,
    isMobile,
    onImportClick,
    onOpmlFileChange,
    opmlInputRef,
  } = props;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <input
        accept=".opml,.xml,text/xml,application/xml"
        className="hidden"
        onChange={(event) => {
          onOpmlFileChange(event);
        }}
        ref={opmlInputRef}
        type="file"
      />
      <Button
        aria-label="Export OPML"
        className={isMobile ? "size-8" : "h-8"}
        onClick={() => {
          const xml = generateOpml(categories);
          const blob = new Blob([xml], { type: "text/xml" });
          const anchor = document.createElement("a");
          anchor.href = URL.createObjectURL(blob);
          anchor.download = "librerss-subscriptions.opml";
          anchor.click();
          URL.revokeObjectURL(anchor.href);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <Download className={isMobile ? "size-4" : "mr-1.5 size-3.5"} />
        {!isMobile ? "Export OPML" : null}
      </Button>
      <Button
        aria-label="Import OPML"
        className={isMobile ? "size-8" : "h-8"}
        disabled={isImportingOpml}
        onClick={onImportClick}
        size="sm"
        type="button"
        variant="outline"
      >
        {isImportingOpml ? (
          <MotionSpinner
            className={isMobile ? undefined : "mr-1.5"}
            iconClassName={isMobile ? "size-4" : "size-3.5"}
          />
        ) : (
          <Upload className={isMobile ? "size-4" : "mr-1.5 size-3.5"} />
        )}
        {!isMobile ? "Import OPML" : null}
      </Button>
    </div>
  );
}

/**
 * Render the settings feed management list component.
 * @param props - The component props.
 * @returns The rendered settings feed management list component.
 */
function SettingsFeedManagementList(
  props: Pick<
    SettingsFeedManagementSectionProps,
    "categories" | "onRemoveCategory" | "pendingCategoryRemovalLabel" | "state"
  >,
) {
  const { categories, onRemoveCategory, pendingCategoryRemovalLabel, state } =
    props;
  return state.isImportingOpml ? (
    <SettingsImportSkeleton />
  ) : (
    <SettingsCategoryList
      addingFeedInCategory={state.addingFeedInCategory}
      categories={categories}
      drag={state.drag}
      editingCategory={state.editingCategory}
      editingCategoryName={state.editingCategoryName}
      isSavingFeed={state.isSavingFeed}
      newCategoryName={state.newCategoryName}
      newFeedName={state.newFeedName}
      newFeedUrl={state.newFeedUrl}
      onAddCategory={state.handleAddCategory}
      onAddFeed={(label) => void state.handleAddFeed(label)}
      onCancelAddFeed={state.onCancelAddFeed}
      onCancelCategoryEdit={state.onCancelCategoryEdit}
      onEditingCategoryNameChange={state.setEditingCategoryName}
      onNewCategoryNameChange={state.setNewCategoryName}
      onNewFeedNameChange={state.setNewFeedName}
      onNewFeedUrlChange={state.setNewFeedUrl}
      onRemoveCategory={(label) => void onRemoveCategory(label)}
      onSaveCategoryRename={(label) => {
        void state.handleSaveCategoryRename(label);
      }}
      onStartCategoryEdit={state.onStartCategoryEdit}
      onToggleAddFeed={state.onToggleAddFeed}
      pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
      savingCategoryLabel={state.savingCategoryLabel}
      sharedFeedRowProps={state.sharedFeedRowProps}
    />
  );
}
