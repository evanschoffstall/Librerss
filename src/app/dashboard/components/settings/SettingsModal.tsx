import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DEFAULT_CATEGORY_LABEL,
  isSameCategoryLabel,
  parseOpmlFeedImport,
  type CategoryTreeNode,
  type OpmlFeedImportEntry,
} from "@/lib";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSettingsDrag } from "../../hooks/useSettingsDrag";
import { CategoryAccordionItem } from "./SettingsCategoryAccordionItem";
import { SettingsDisplaySection } from "./SettingsDisplaySection";

interface SettingsModalProps {
  onClose: () => void;
  categories: CategoryTreeNode[];
  categoryOptions: string[];
  pendingCategoryRemovalLabel: string | null;
  selectedCategory: string;
  pageSize: number;
  showFavicons: boolean;
  onPageSizeChange: (size: number) => void;
  onShowFaviconsChange: (value: boolean) => void;
  onImportOpml: (entries: OpmlFeedImportEntry[]) => Promise<void>;
  onSelectFeed: (key: string) => void;
  onDropFeed: (key: string, targetCategory: string, targetIndex: number) => Promise<void>;
  onAddFeed: (name: string, url: string, category: string) => Promise<boolean>;
  onAddCategory: (name: string) => boolean;
  onRenameCategory: (fromLabel: string, toLabel: string) => Promise<boolean>;
  onDropCategory: (label: string, targetIndex: number) => Promise<void>;
  onRemoveCategory: (label: string) => Promise<boolean>;
  onRemoveFeed: (key: string) => Promise<void>;
  onRenameFeed: (key: string, name: string) => Promise<boolean>;
}

export const SettingsModal = ({
  onClose,
  categories,
  categoryOptions,
  pendingCategoryRemovalLabel,
  selectedCategory,
  pageSize,
  showFavicons,
  onPageSizeChange,
  onShowFaviconsChange,
  onImportOpml,
  onSelectFeed,
  onDropFeed,
  onAddFeed,
  onAddCategory,
  onRenameCategory,
  onDropCategory,
  onRemoveCategory,
  onRemoveFeed,
  onRenameFeed,
}: SettingsModalProps) => {
  // ── Add-feed form state ───────────────────────────────────────────────────
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newFeedCategory, setNewFeedCategory] = useState(
    categoryOptions[0] ?? DEFAULT_CATEGORY_LABEL,
  );
  const [addingFeedInCategory, setAddingFeedInCategory] = useState<string | null>(null);
  const [isSavingFeed, setIsSavingFeed] = useState(false);

  // ── Category edit state ───────────────────────────────────────────────────
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [savingCategoryLabel, setSavingCategoryLabel] = useState<string | null>(null);

  // ── Feed edit state ───────────────────────────────────────────────────────
  const [editingFeedKey, setEditingFeedKey] = useState<string | null>(null);
  const [editingFeedName, setEditingFeedName] = useState("");
  const [savingFeedKey, setSavingFeedKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // ── Drag state & handlers ─────────────────────────────────────────────────
  const drag = useSettingsDrag({ onDropFeed, onDropCategory });

  // ── OPML ──────────────────────────────────────────────────────────────────
  const [isImportingOpml, setIsImportingOpml] = useState(false);
  const opmlInputRef = useRef<HTMLInputElement | null>(null);

  // Keep default category in sync when options change
  useEffect(() => {
    if (!categoryOptions.includes(newFeedCategory)) {
      setNewFeedCategory(categoryOptions[0] ?? DEFAULT_CATEGORY_LABEL);
    }
  }, [categoryOptions, newFeedCategory]);

  // Clear stale editing state when categories change
  useEffect(() => {
    if (
      addingFeedInCategory &&
      !categories.some((n) => isSameCategoryLabel(n.label, addingFeedInCategory))
    ) {
      setAddingFeedInCategory(null);
    }
    if (
      editingCategory &&
      !categories.some((n) => isSameCategoryLabel(n.label, editingCategory))
    ) {
      setEditingCategory(null);
      setEditingCategoryName("");
    }
    if (
      editingFeedKey &&
      !categories.some((n) =>
        (n.children ?? []).some((f: CategoryTreeNode) => f.key === editingFeedKey),
      )
    ) {
      setEditingFeedKey(null);
      setEditingFeedName("");
    }
  }, [categories, addingFeedInCategory, editingCategory, editingFeedKey]);

  // ── Feed handlers ─────────────────────────────────────────────────────────

  const handleAddFeed = async (categoryLabel: string) => {
    setIsSavingFeed(true);
    try {
      const didSave = await onAddFeed(newFeedName.trim(), newFeedUrl.trim(), categoryLabel);
      if (!didSave) return;
      setNewFeedName("");
      setNewFeedUrl("");
      setAddingFeedInCategory(null);
    } finally {
      setIsSavingFeed(false);
    }
  };

  const handleRemoveFeed = async (key: string) => {
    setDeletingKey(key);
    try {
      await onRemoveFeed(key);
    } finally {
      setDeletingKey(null);
    }
  };

  const handleSaveFeedRename = async (feedKey: string) => {
    setSavingFeedKey(feedKey);
    try {
      const didSave = await onRenameFeed(feedKey, editingFeedName.trim());
      if (!didSave) return;
      setEditingFeedKey(null);
      setEditingFeedName("");
    } finally {
      setSavingFeedKey(null);
    }
  };

  // ── Category handlers ─────────────────────────────────────────────────────

  const handleAddCategory = () => {
    const didAdd = onAddCategory(newCategoryName.trim());
    if (!didAdd) return;
    setNewCategoryName("");
  };

  const handleSaveCategoryRename = async (currentLabel: string) => {
    setSavingCategoryLabel(currentLabel);
    try {
      const didSave = await onRenameCategory(currentLabel, editingCategoryName.trim());
      if (!didSave) return;
      setEditingCategory(null);
      setEditingCategoryName("");
    } finally {
      setSavingCategoryLabel(null);
    }
  };

  // ── OPML handlers ─────────────────────────────────────────────────────────

  const handleOpmlFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setIsImportingOpml(true);
    try {
      const content = await file.text();
      const entries = parseOpmlFeedImport(content);
      if (entries.length === 0) {
        toast.error("No valid feeds found in this OPML file.");
        return;
      }
      await onImportOpml(entries);
    } catch (error) {
      console.error("OPML import parse error:", error);
      toast.error("Unable to import this OPML file.");
    } finally {
      setIsImportingOpml(false);
    }
  };

  // ── Shared accordion item props ───────────────────────────────────────────

  const sharedFeedRowProps = {
    selectedCategory,
    editingFeedKey,
    editingFeedName,
    savingFeedKey,
    deletingKey,
    movingFeedKey: drag.movingFeedKey,
    draggingFeedKey: drag.draggingFeedKey,
    feedDropTarget: drag.feedDropTarget,
    onFeedDragStart: drag.onFeedDragStart,
    onFeedDragEnd: drag.onFeedDragEnd,
    onFeedDragOver: drag.onFeedDragOver,
    onFeedDrop: drag.onFeedDrop,
    onSelectFeed,
    onEditingFeedNameChange: setEditingFeedName,
    onSaveFeedRename: (key: string) => void handleSaveFeedRename(key),
    onCancelFeedEdit: () => { setEditingFeedKey(null); setEditingFeedName(""); },
    onStartFeedEdit: (key: string, name: string) => { setEditingFeedKey(key); setEditingFeedName(name); },
    onRemoveFeed: (key: string) => void handleRemoveFeed(key),
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[90vh] max-h-[90vh] max-w-3xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reader Settings</DialogTitle>
          <DialogDescription>
            Manage categories, feeds, ordering, and runtime behavior.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <motion.div
            className="space-y-6 py-1 pr-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <SettingsDisplaySection
              pageSize={pageSize}
              showFavicons={showFavicons}
              onPageSizeChange={onPageSizeChange}
              onShowFaviconsChange={onShowFaviconsChange}
            />

            <section className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Feeds</h3>
                  <p className="text-xs text-muted-foreground">
                    Manage categories, feeds, and ordering.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <input
                    ref={opmlInputRef}
                    type="file"
                    accept=".opml,.xml,text/xml,application/xml"
                    className="hidden"
                    onChange={handleOpmlFileChange}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => opmlInputRef.current?.click()}
                    disabled={isImportingOpml}
                  >
                    {isImportingOpml ? (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 size-3.5" />
                    )}
                    Import OPML
                  </Button>
                </div>
              </div>

              <TooltipProvider delayDuration={300}>
                <AnimatePresence mode="wait" initial={false}>
                  {isImportingOpml ? (
                    <motion.div
                      key="feeds-skeleton"
                      className="space-y-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="rounded-md border px-3 py-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <Skeleton className="h-3 w-20" />
                            <div className="flex gap-1">
                              <Skeleton className="size-7 rounded-md" />
                              <Skeleton className="size-7 rounded-md" />
                            </div>
                          </div>
                          {i < 3 && (
                            <div className="space-y-1.5 pt-0.5">
                              {Array.from({ length: 2 + (i % 2) }).map((_, j) => (
                                <div key={j} className="flex items-center gap-2 rounded-md border px-3 py-2">
                                  <Skeleton className="size-4" />
                                  <div className="flex-1 space-y-1">
                                    <Skeleton className="h-3 w-32" />
                                    <Skeleton className="h-2.5 w-40" />
                                  </div>
                                  <Skeleton className="size-7 rounded-md" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <p className="text-center text-xs text-muted-foreground animate-pulse pt-1">
                        Importing feeds…
                      </p>
                    </motion.div>
                  ) : categories.length === 0 ? (
                    <motion.div
                      key="feeds-empty"
                      className="py-8 text-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <p className="text-sm text-muted-foreground">No categories yet.</p>
                      <div className="mt-3 flex items-center justify-center gap-2">
                        <Input
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Category name..."
                          className="max-w-[200px]"
                          onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                        />
                        <Button
                          size="sm"
                          onClick={handleAddCategory}
                          disabled={!newCategoryName.trim()}
                        >
                          <Plus className="mr-1.5 size-3.5" />
                          Add
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="feeds-accordion"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Accordion
                        key={categories
                          .map((n) => `${n.key}:${(n.children ?? []).length}`)
                          .join("|")}
                        type="multiple"
                        defaultValue={categories.map((c) => c.key)}
                        className="space-y-2"
                      >
                        {categories.map((categoryNode, categoryIndex) => (
                          <CategoryAccordionItem
                            key={categoryNode.key}
                            categoryNode={categoryNode}
                            categoryIndex={categoryIndex}
                            pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
                            addingFeedInCategory={addingFeedInCategory}
                            newFeedName={newFeedName}
                            newFeedUrl={newFeedUrl}
                            isSavingFeed={isSavingFeed}
                            editingCategory={editingCategory}
                            editingCategoryName={editingCategoryName}
                            savingCategoryLabel={savingCategoryLabel}
                            categoryDropIndex={drag.categoryDropIndex}
                            onCategoryDragStart={drag.onCategoryDragStart}
                            onCategoryDragEnd={drag.onCategoryDragEnd}
                            onCategoryDragOver={drag.onCategoryDragOver}
                            onCategoryDrop={drag.onCategoryDrop}
                            onEditingCategoryNameChange={setEditingCategoryName}
                            onSaveCategoryRename={(label) => void handleSaveCategoryRename(label)}
                            onCancelCategoryEdit={() => {
                              setEditingCategory(null);
                              setEditingCategoryName("");
                            }}
                            onStartCategoryEdit={(label) => {
                              setEditingCategory(label);
                              setEditingCategoryName(label);
                            }}
                            onToggleAddFeed={(label) => {
                              setAddingFeedInCategory(
                                addingFeedInCategory === label ? null : label,
                              );
                              setNewFeedName("");
                              setNewFeedUrl("");
                            }}
                            onRemoveCategory={(label) => void onRemoveCategory(label)}
                            onNewFeedNameChange={setNewFeedName}
                            onNewFeedUrlChange={setNewFeedUrl}
                            onAddFeed={(label) => void handleAddFeed(label)}
                            onCancelAddFeed={() => setAddingFeedInCategory(null)}
                            {...sharedFeedRowProps}
                          />
                        ))}

                        {drag.draggingCategoryLabel && (
                          <div
                            className={`rounded-md border border-dashed px-3 py-2 text-center text-xs ${drag.categoryDropIndex === categories.length
                              ? "border-primary bg-primary/5 text-foreground"
                              : "text-muted-foreground"
                              }`}
                            onDragOver={(event) =>
                              drag.onCategoryDragOver(event, categories.length)
                            }
                            onDrop={(event) => drag.onCategoryDrop(event, categories.length)}
                          >
                            Drop category here
                          </div>
                        )}

                        <div className="flex items-center gap-2 rounded-md border border-dashed p-2.5">
                          <Input
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="New category name..."
                            className="h-8 text-sm"
                            onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0"
                            onClick={handleAddCategory}
                            disabled={!newCategoryName.trim()}
                          >
                            <Plus className="mr-1.5 size-3.5" />
                            Add Category
                          </Button>
                        </div>
                      </Accordion>
                    </motion.div>
                  )}
                </AnimatePresence>
              </TooltipProvider>
            </section>
          </motion.div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
