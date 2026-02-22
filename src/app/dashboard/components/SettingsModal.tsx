import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DEFAULT_CATEGORY_LABEL,
  parseOpmlFeedImport,
  type CategoryTreeNode,
  type OpmlFeedImportEntry,
} from "@/lib";
import { AnimatePresence, motion } from "framer-motion";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const IconBtn = ({
  tip,
  onClick,
  disabled,
  children,
  className,
}: {
  tip: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className={`size-7 ${className ?? ""}`}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top">{tip}</TooltipContent>
  </Tooltip>
);

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
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newFeedCategory, setNewFeedCategory] = useState(categoryOptions[0] ?? DEFAULT_CATEGORY_LABEL);
  const [addingFeedInCategory, setAddingFeedInCategory] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingFeedKey, setEditingFeedKey] = useState<string | null>(null);
  const [editingFeedName, setEditingFeedName] = useState("");
  const [isSavingFeed, setIsSavingFeed] = useState(false);
  const [movingFeedKey, setMovingFeedKey] = useState<string | null>(null);
  const [savingCategoryLabel, setSavingCategoryLabel] = useState<string | null>(null);
  const [savingFeedKey, setSavingFeedKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [isImportingOpml, setIsImportingOpml] = useState(false);
  const [draggingFeedKey, setDraggingFeedKey] = useState<string | null>(null);
  const [feedDropTarget, setFeedDropTarget] = useState<{ categoryLabel: string; index: number } | null>(
    null,
  );
  const [draggingCategoryLabel, setDraggingCategoryLabel] = useState<string | null>(null);
  const [categoryDropIndex, setCategoryDropIndex] = useState<number | null>(null);
  const opmlInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!categoryOptions.includes(newFeedCategory)) {
      setNewFeedCategory(categoryOptions[0] ?? DEFAULT_CATEGORY_LABEL);
    }
  }, [categoryOptions, newFeedCategory]);

  useEffect(() => {
    if (
      addingFeedInCategory &&
      !categories.some(
        (categoryNode) => categoryNode.label.trim().toLowerCase() === addingFeedInCategory.trim().toLowerCase(),
      )
    ) {
      setAddingFeedInCategory(null);
    }

    if (
      editingCategory &&
      !categories.some(
        (categoryNode) => categoryNode.label.trim().toLowerCase() === editingCategory.trim().toLowerCase(),
      )
    ) {
      setEditingCategory(null);
      setEditingCategoryName("");
    }

    if (
      editingFeedKey &&
      !categories.some((categoryNode) =>
        (categoryNode.children ?? []).some(
          (feedNode: CategoryTreeNode) => feedNode.key === editingFeedKey,
        ),
      )
    ) {
      setEditingFeedKey(null);
      setEditingFeedName("");
    }
  }, [categories, addingFeedInCategory, editingCategory, editingFeedKey]);

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

  const handleAddCategory = () => {
    const didAdd = onAddCategory(newCategoryName.trim());
    if (!didAdd) return;
    setNewCategoryName("");
  };

  const handleRemoveFeed = async (key: string) => {
    setDeletingKey(key);
    try {
      await onRemoveFeed(key);
    } finally {
      setDeletingKey(null);
    }
  };

  const handleFeedDragStart = (event: React.DragEvent<HTMLButtonElement>, key: string) => {
    setDraggingFeedKey(key);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
  };

  const handleFeedDragEnd = () => {
    setDraggingFeedKey(null);
    setFeedDropTarget(null);
  };

  const handleFeedDragOver = (
    event: React.DragEvent<HTMLElement>,
    categoryLabel: string,
    index: number,
  ) => {
    if (!draggingFeedKey) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setFeedDropTarget({ categoryLabel, index });
  };

  const handleFeedDrop = async (
    event: React.DragEvent<HTMLElement>,
    categoryLabel: string,
    index: number,
  ) => {
    event.preventDefault();
    const droppedKey = event.dataTransfer.getData("text/plain") || draggingFeedKey;
    setFeedDropTarget(null);

    if (!droppedKey) {
      return;
    }

    setMovingFeedKey(droppedKey);
    try {
      await onDropFeed(droppedKey, categoryLabel, index);
    } finally {
      setMovingFeedKey(null);
      setDraggingFeedKey(null);
    }
  };

  const handleCategoryDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    label: string,
  ) => {
    setDraggingCategoryLabel(label);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", label);
  };

  const handleCategoryDragEnd = () => {
    setDraggingCategoryLabel(null);
    setCategoryDropIndex(null);
  };

  const handleCategoryDragOver = (event: React.DragEvent<HTMLElement>, index: number) => {
    if (!draggingCategoryLabel) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setCategoryDropIndex(index);
  };

  const handleCategoryDrop = async (event: React.DragEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    const droppedLabel = event.dataTransfer.getData("text/plain") || draggingCategoryLabel;
    setCategoryDropIndex(null);

    if (!droppedLabel) {
      return;
    }

    try {
      await onDropCategory(droppedLabel, index);
    } finally {
      setDraggingCategoryLabel(null);
    }
  };

  const startEditingCategory = (currentLabel: string) => {
    setEditingCategory(currentLabel);
    setEditingCategoryName(currentLabel);
  };

  const startEditingFeed = (feedKey: string, currentName: string) => {
    setEditingFeedKey(feedKey);
    setEditingFeedName(currentName);
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

  const handleSaveFeedRename = async (feedKey: string) => {
    setSavingFeedKey(feedKey);
    try {
      const didSave = await onRenameFeed(feedKey, editingFeedName.trim());
      if (!didSave) {
        return;
      }

      setEditingFeedKey(null);
      setEditingFeedName("");
    } finally {
      setSavingFeedKey(null);
    }
  };

  const openOpmlPicker = () => {
    opmlInputRef.current?.click();
  };

  const handleOpmlFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[90vh] max-h-[90vh] max-w-3xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reader Settings</DialogTitle>
          <DialogDescription>Manage categories, feeds, ordering, and runtime behavior.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <motion.div
            className="space-y-6 py-1 pr-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">Display</h3>
                <p className="text-xs text-muted-foreground">Adjust reader presentation preferences.</p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-refresh">Auto-refresh</Label>
                <Switch id="auto-refresh" defaultChecked />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label>Items per page</Label>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => onPageSizeChange(Number(v))}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select amount" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 articles</SelectItem>
                    <SelectItem value="25">25 articles</SelectItem>
                    <SelectItem value="50">50 articles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-favicons">Show favicons</Label>
                <Switch
                  id="show-favicons"
                  checked={showFavicons}
                  onCheckedChange={onShowFaviconsChange}
                />
              </div>
            </section>

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
                    onClick={openOpmlPicker}
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
                        <Button size="sm" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
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
                      key={categories.map((categoryNode) => `${categoryNode.key}:${(categoryNode.children ?? []).length}`).join("|")}
                    type="multiple"
                    defaultValue={categories.map((c) => c.key)}
                    className="space-y-2"
                  >
                    {categories.map((categoryNode, categoryIndex) => {
                      const categoryFeeds = categoryNode.children ?? [];
                      const isEditing = editingCategory === categoryNode.label;
                      const isAddingFeed = addingFeedInCategory === categoryNode.label;
                      const isPendingRemoval =
                        categoryNode.label.trim().toLowerCase() ===
                        (pendingCategoryRemovalLabel ?? "").trim().toLowerCase();

                      return (
                        <motion.div
                          key={`${categoryNode.key}-motion`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut", delay: categoryIndex * 0.02 }}
                          className={
                            categoryDropIndex === categoryIndex
                              ? "rounded-md border border-primary bg-primary/5"
                              : ""
                          }
                          onDragOver={(event) => handleCategoryDragOver(event, categoryIndex)}
                          onDrop={(event) => handleCategoryDrop(event, categoryIndex)}
                        >
                          <AccordionItem
                            key={categoryNode.key}
                            value={categoryNode.key}
                            className="rounded-md border border-b px-0"
                          >
                            <div className="flex items-center gap-2 px-3">
                              {!isEditing && (
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={(event) =>
                                    handleCategoryDragStart(event, categoryNode.label)
                                  }
                                  onDragEnd={handleCategoryDragEnd}
                                  className="shrink-0 cursor-grab text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing"
                                  aria-label={`Drag category ${categoryNode.label}`}
                                >
                                  <GripVertical className="size-4" />
                                </button>
                              )}
                              {isEditing ? (
                                <div className="mr-2 flex flex-1 items-center gap-2 py-2.5">
                                  <Input
                                    value={editingCategoryName}
                                    onChange={(e) => setEditingCategoryName(e.target.value)}
                                    className="h-7 text-xs"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleSaveCategoryRename(categoryNode.label);
                                      if (e.key === "Escape") {
                                        setEditingCategory(null);
                                        setEditingCategoryName("");
                                      }
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      void handleSaveCategoryRename(categoryNode.label);
                                    }}
                                    disabled={!editingCategoryName.trim() || savingCategoryLabel === categoryNode.label}
                                  >
                                    {savingCategoryLabel === categoryNode.label && (
                                      <Loader2 className="mr-1 size-3 animate-spin" />
                                    )}
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      setEditingCategory(null);
                                      setEditingCategoryName("");
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <AccordionTrigger className="flex-1 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70 hover:no-underline">
                                  <span
                                    className="flex items-center gap-2"
                                    onDoubleClick={(event) => {
                                      event.stopPropagation();
                                      startEditingCategory(categoryNode.label);
                                    }}
                                    title="Double-click to rename"
                                  >
                                    {categoryNode.label}
                                  </span>
                                </AccordionTrigger>
                              )}

                              {!isEditing && (
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <IconBtn
                                    tip="Add feed"
                                    onClick={() => {
                                      setAddingFeedInCategory(isAddingFeed ? null : categoryNode.label);
                                      setNewFeedName("");
                                      setNewFeedUrl("");
                                    }}
                                    className={isAddingFeed ? "bg-accent" : ""}
                                  >
                                    <Plus className="size-3.5" />
                                  </IconBtn>
                                  <IconBtn
                                    tip={isPendingRemoval ? "Click again to confirm" : "Delete category"}
                                    onClick={() => {
                                      void onRemoveCategory(categoryNode.label);
                                    }}
                                    className={
                                      isPendingRemoval
                                        ? "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                                        : "text-muted-foreground hover:text-destructive"
                                    }
                                  >
                                    <Trash2 className="size-3.5" />
                                  </IconBtn>
                                </div>
                              )}
                            </div>

                            <AccordionContent className="px-3 pb-3">
                              {/* Inline add feed form */}
                              <AnimatePresence initial={false}>
                                {isAddingFeed && (
                                  <motion.div
                                    className="mb-2 flex items-center gap-2 rounded-md border border-dashed p-2"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                  >
                                    <Input
                                      value={newFeedName}
                                      onChange={(e) => setNewFeedName(e.target.value)}
                                      placeholder="Feed name"
                                      className="h-8 text-sm"
                                      autoFocus
                                    />
                                    <Input
                                      value={newFeedUrl}
                                      onChange={(e) => setNewFeedUrl(e.target.value)}
                                      placeholder="https://example.com/feed.xml"
                                      className="h-8 text-sm"
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && newFeedName.trim() && newFeedUrl.trim()) {
                                          handleAddFeed(categoryNode.label);
                                        }
                                        if (e.key === "Escape") setAddingFeedInCategory(null);
                                      }}
                                    />
                                    <Button
                                      size="sm"
                                      className="h-8 shrink-0"
                                      onClick={() => handleAddFeed(categoryNode.label)}
                                      disabled={!newFeedName.trim() || !newFeedUrl.trim() || isSavingFeed}
                                    >
                                      {isSavingFeed ? <Loader2 className="size-3.5 animate-spin" /> : "Add"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 shrink-0 px-2"
                                      onClick={() => setAddingFeedInCategory(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {categoryFeeds.length === 0 && !isAddingFeed ? (
                                <div
                                  className={`rounded-md border border-dashed px-3 py-4 text-center text-xs ${feedDropTarget?.categoryLabel === categoryNode.label &&
                                    feedDropTarget?.index === 0
                                    ? "border-primary bg-primary/5 text-foreground"
                                    : "text-muted-foreground"
                                    }`}
                                  onDragOver={(event) =>
                                    handleFeedDragOver(event, categoryNode.label, 0)
                                  }
                                  onDrop={(event) => handleFeedDrop(event, categoryNode.label, 0)}
                                >
                                  {draggingFeedKey
                                    ? "Drop feed here"
                                    : "Empty — click + to add a feed."}
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {categoryFeeds.map((feedNode: CategoryTreeNode, index: number) => (
                                    <motion.div
                                      key={feedNode.key}
                                      className={`flex items-center gap-2 rounded-md border px-3 py-2 ${feedDropTarget?.categoryLabel === categoryNode.label &&
                                        feedDropTarget?.index === index
                                        ? "border-primary bg-primary/5"
                                        : ""
                                        }`}
                                      initial={{ opacity: 0, y: 6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ duration: 0.2, ease: "easeOut", delay: index * 0.015 }}
                                      whileHover={{ y: -1 }}
                                      onDragOver={(event) =>
                                        handleFeedDragOver(event, categoryNode.label, index)
                                      }
                                      onDrop={(event) => handleFeedDrop(event, categoryNode.label, index)}
                                    >
                                      <button
                                        type="button"
                                        draggable
                                        onDragStart={(event) => handleFeedDragStart(event, feedNode.key)}
                                        onDragEnd={handleFeedDragEnd}
                                        className="shrink-0 cursor-grab text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing"
                                        aria-label={`Drag ${feedNode.label}`}
                                      >
                                        <GripVertical className="size-4" />
                                      </button>
                                      {editingFeedKey === feedNode.key ? (
                                        <div className="flex min-w-0 flex-1 items-center gap-2">
                                          <Input
                                            value={editingFeedName}
                                            onChange={(event) => setEditingFeedName(event.target.value)}
                                            className="h-7 text-xs"
                                            autoFocus
                                            onKeyDown={(event) => {
                                              if (event.key === "Enter") {
                                                handleSaveFeedRename(feedNode.key);
                                              }
                                              if (event.key === "Escape") {
                                                setEditingFeedKey(null);
                                                setEditingFeedName("");
                                              }
                                            }}
                                          />
                                          <Button
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => handleSaveFeedRename(feedNode.key)}
                                            disabled={!editingFeedName.trim() || savingFeedKey === feedNode.key}
                                          >
                                            {savingFeedKey === feedNode.key ? (
                                              <Loader2 className="mr-1 size-3 animate-spin" />
                                            ) : null}
                                            Save
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 text-xs"
                                            onClick={() => {
                                              setEditingFeedKey(null);
                                              setEditingFeedName("");
                                            }}
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => onSelectFeed(feedNode.key)}
                                          className={`min-w-0 flex-1 text-left ${movingFeedKey === feedNode.key ? "opacity-60" : ""
                                            }`}
                                          type="button"
                                        >
                                          <p
                                            className={`truncate text-sm ${selectedCategory === feedNode.key ? "font-medium text-foreground" : "text-foreground/80"}`}
                                            onDoubleClick={(event) => {
                                              event.stopPropagation();
                                              startEditingFeed(feedNode.key, feedNode.label);
                                            }}
                                            title="Double-click to rename"
                                          >
                                            {feedNode.label}
                                          </p>
                                          {feedNode.data?.url && (
                                            <p className="truncate text-xs text-muted-foreground/70">
                                              {feedNode.data.url}
                                            </p>
                                          )}
                                        </button>
                                      )}

                                      <div className="flex shrink-0 items-center gap-1">
                                        <IconBtn
                                          tip="Remove feed"
                                          onClick={() => handleRemoveFeed(feedNode.key)}
                                          disabled={deletingKey === feedNode.key || draggingFeedKey === feedNode.key}
                                          className="text-muted-foreground hover:text-destructive"
                                        >
                                          {deletingKey === feedNode.key ? (
                                            <Loader2 className="size-3.5 animate-spin" />
                                          ) : (
                                            <Trash2 className="size-3.5" />
                                          )}
                                        </IconBtn>
                                      </div>
                                    </motion.div>
                                  ))}
                                  {draggingFeedKey ? (
                                    <div
                                      className={`rounded-md border border-dashed px-3 py-2 text-center text-xs ${feedDropTarget?.categoryLabel === categoryNode.label &&
                                        feedDropTarget?.index === categoryFeeds.length
                                        ? "border-primary bg-primary/5 text-foreground"
                                        : "text-muted-foreground"
                                        }`}
                                      onDragOver={(event) =>
                                        handleFeedDragOver(event, categoryNode.label, categoryFeeds.length)
                                      }
                                      onDrop={(event) =>
                                        handleFeedDrop(event, categoryNode.label, categoryFeeds.length)
                                      }
                                    >
                                      Drop here to place at end
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        </motion.div>
                      );
                    })}

                    {draggingCategoryLabel ? (
                      <div
                        className={`rounded-md border border-dashed px-3 py-2 text-center text-xs ${categoryDropIndex === categories.length
                          ? "border-primary bg-primary/5 text-foreground"
                          : "text-muted-foreground"
                          }`}
                        onDragOver={(event) => handleCategoryDragOver(event, categories.length)}
                        onDrop={(event) => handleCategoryDrop(event, categories.length)}
                      >
                        Drop category here
                      </div>
                    ) : null}

                    {/* Add category — inline at bottom of list */}
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
