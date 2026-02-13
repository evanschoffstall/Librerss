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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CategoryTreeNode } from "@/src/lib";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface SettingsModalProps {
  onClose: () => void;
  categories: CategoryTreeNode[];
  categoryOptions: string[];
  selectedCategory: string;
  isDevelopment: boolean;
  isUsingDevPlaceholder: boolean;
  feedCount: number;
  onSelectFeed: (key: string) => void;
  onMoveFeed: (key: string, direction: "up" | "down") => void;
  onMoveFeedToCategory: (key: string, categoryLabel: string) => Promise<void>;
  onAddFeed: (name: string, url: string, category: string) => Promise<boolean>;
  onAddCategory: (name: string) => boolean;
  onRenameCategory: (fromLabel: string, toLabel: string) => Promise<boolean>;
  onMoveCategory: (label: string, direction: "up" | "down") => void;
  onRemoveCategory: (label: string) => boolean;
  onRemoveFeed: (key: string) => Promise<void>;
}

export const SettingsModal = ({
  onClose,
  categories,
  categoryOptions,
  selectedCategory,
  isDevelopment,
  isUsingDevPlaceholder,
  feedCount,
  onSelectFeed,
  onMoveFeed,
  onMoveFeedToCategory,
  onAddFeed,
  onAddCategory,
  onRenameCategory,
  onMoveCategory,
  onRemoveCategory,
  onRemoveFeed,
}: SettingsModalProps) => {
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newFeedCategory, setNewFeedCategory] = useState(categoryOptions[0] ?? "My Feeds");
  const [addingFeedInCategory, setAddingFeedInCategory] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [isSavingFeed, setIsSavingFeed] = useState(false);
  const [movingFeedKey, setMovingFeedKey] = useState<string | null>(null);
  const [savingCategoryLabel, setSavingCategoryLabel] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const feedNodes = useMemo(
    () => categories.flatMap((categoryNode) => categoryNode.children ?? []),
    [categories],
  );

  useEffect(() => {
    if (!categoryOptions.includes(newFeedCategory)) {
      setNewFeedCategory(categoryOptions[0] ?? "My Feeds");
    }
  }, [categoryOptions, newFeedCategory]);

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

  const handleMoveFeedToCategory = async (key: string, categoryLabel: string) => {
    setMovingFeedKey(key);
    try {
      await onMoveFeedToCategory(key, categoryLabel);
    } finally {
      setMovingFeedKey(null);
    }
  };

  const startEditingCategory = (currentLabel: string) => {
    setEditingCategory(currentLabel);
    setEditingCategoryName(currentLabel);
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl flex flex-col">
        <DialogHeader>
          <DialogTitle>Reader Settings</DialogTitle>
          <DialogDescription>Manage categories, feeds, ordering, and runtime behavior.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <Tabs defaultValue="feeds" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="feeds">Feeds</TabsTrigger>
              <TabsTrigger value="preferences">Display</TabsTrigger>
              <TabsTrigger value="runtime">Runtime</TabsTrigger>
            </TabsList>

            <TabsContent value="feeds" className="mt-4">
              <TooltipProvider delayDuration={300}>
                {categories.length === 0 ? (
                  <div className="py-8 text-center">
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
                  </div>
                ) : (
                  <Accordion
                    type="multiple"
                    defaultValue={categories.map((c) => c.key)}
                    className="space-y-2"
                  >
                    {categories.map((categoryNode, categoryIndex) => {
                      const categoryFeeds = categoryNode.children ?? [];
                      const isEditing = editingCategory === categoryNode.label;
                      const isAddingFeed = addingFeedInCategory === categoryNode.label;

                      return (
                        <AccordionItem
                          key={categoryNode.key}
                          value={categoryNode.key}
                          className="rounded-md border border-b px-0"
                        >
                          <div className="flex items-center gap-2 px-3">
                            <AccordionTrigger className="flex-1 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70 hover:no-underline">
                              {isEditing ? (
                                <div
                                  className="mr-2 flex flex-1 items-center gap-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
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
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSaveCategoryRename(categoryNode.label);
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
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCategory(null);
                                      setEditingCategoryName("");
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <span className="flex items-center gap-2">
                                  {categoryNode.label}
                                </span>
                              )}
                            </AccordionTrigger>

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
                                  tip="Move up"
                                  onClick={() => onMoveCategory(categoryNode.label, "up")}
                                  disabled={categoryIndex === 0}
                                >
                                  <ArrowUp className="size-3.5" />
                                </IconBtn>
                                <IconBtn
                                  tip="Move down"
                                  onClick={() => onMoveCategory(categoryNode.label, "down")}
                                  disabled={categoryIndex === categories.length - 1}
                                >
                                  <ArrowDown className="size-3.5" />
                                </IconBtn>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => startEditingCategory(categoryNode.label)}
                                >
                                  Rename
                                </Button>
                                <IconBtn
                                  tip="Delete category"
                                  onClick={() => onRemoveCategory(categoryNode.label)}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="size-3.5" />
                                </IconBtn>
                              </div>
                            )}
                          </div>

                          <AccordionContent className="px-3 pb-3">
                            {/* Inline add feed form */}
                            {isAddingFeed && (
                              <div className="mb-2 flex items-center gap-2 rounded-md border border-dashed p-2">
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
                              </div>
                            )}

                            {categoryFeeds.length === 0 && !isAddingFeed ? (
                              <p className="py-2 text-xs text-muted-foreground">Empty — click + to add a feed.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {categoryFeeds.map((feedNode, index) => (
                                  <div
                                    key={feedNode.key}
                                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                                  >
                                    <button
                                      onClick={() => onSelectFeed(feedNode.key)}
                                      className="min-w-0 flex-1 text-left"
                                    >
                                      <p className={`truncate text-sm ${selectedCategory === feedNode.key ? "font-medium text-foreground" : "text-foreground/80"}`}>
                                        {feedNode.label}
                                      </p>
                                      {feedNode.data?.url && (
                                        <p className="truncate text-xs text-muted-foreground/70">
                                          {feedNode.data.url}
                                        </p>
                                      )}
                                    </button>

                                    <div className="flex shrink-0 items-center gap-1">
                                      <Select
                                        value={categoryNode.label}
                                        onValueChange={(nextCategory) =>
                                          handleMoveFeedToCategory(feedNode.key, nextCategory)
                                        }
                                        disabled={movingFeedKey === feedNode.key}
                                      >
                                        <SelectTrigger className="h-7 w-[140px] text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {categoryOptions.map((categoryLabel) => (
                                            <SelectItem
                                              key={`${feedNode.key}-${categoryLabel}`}
                                              value={categoryLabel}
                                              className="text-xs"
                                            >
                                              {categoryLabel}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>

                                      <IconBtn
                                        tip="Move up"
                                        onClick={() => onMoveFeed(feedNode.key, "up")}
                                        disabled={index === 0}
                                      >
                                        <ArrowUp className="size-3.5" />
                                      </IconBtn>
                                      <IconBtn
                                        tip="Move down"
                                        onClick={() => onMoveFeed(feedNode.key, "down")}
                                        disabled={index === categoryFeeds.length - 1}
                                      >
                                        <ArrowDown className="size-3.5" />
                                      </IconBtn>
                                      <IconBtn
                                        tip="Remove feed"
                                        onClick={() => handleRemoveFeed(feedNode.key)}
                                        disabled={deletingKey === feedNode.key}
                                        className="text-muted-foreground hover:text-destructive"
                                      >
                                        {deletingKey === feedNode.key ? (
                                          <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="size-3.5" />
                                        )}
                                      </IconBtn>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}

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
                )}
              </TooltipProvider>
            </TabsContent>

            <TabsContent value="preferences" className="space-y-6">
              <div className="flex items-center justify-between rounded-md border p-4">
                <Label htmlFor="auto-refresh">Auto-refresh</Label>
                <Switch id="auto-refresh" defaultChecked />
              </div>
              <div className="space-y-2 rounded-md border p-4">
                <Label>Items per page</Label>
                <Select defaultValue="25">
                  <SelectTrigger>
                    <SelectValue placeholder="Select amount" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 articles</SelectItem>
                    <SelectItem value="25">25 articles</SelectItem>
                    <SelectItem value="50">50 articles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="runtime" className="space-y-3">
              <div className="rounded-md border p-4">
                <h3 className="text-sm font-medium">Environment</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mode: {isDevelopment ? "Development" : "Production"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Placeholder content: {isUsingDevPlaceholder ? "Active" : "Inactive"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isDevelopment
                    ? "Development mode can show mock articles when feeds are empty or fail."
                    : "Production mode only shows live feed responses."}
                </p>
              </div>

              <div className="rounded-md border p-4">
                <h3 className="text-sm font-medium">Current Feed State</h3>
                <p className="mt-1 text-sm text-muted-foreground">Configured feeds: {feedCount}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Selected source: {feedNodes.find((node) => node.key === selectedCategory)?.label ?? "None"}
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
