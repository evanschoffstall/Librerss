import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_CATEGORY_LABEL, FeedService, isValidUrl, type CategoryTreeNode } from "@/lib";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { INITIAL_CATEGORIES, SAMPLE_FEEDS } from "../constants";

export const SettingsView = () => {
  const [categories, setCategories] = useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const loadSources = async () => {
    try {
      const sources = await FeedService.getFeedSources();

      if (sources.length === 0) {
        setCategories(INITIAL_CATEGORIES);
        return;
      }

      setCategories([
        {
          key: "0",
          label: DEFAULT_CATEGORY_LABEL,
          children: sources.map((source) => ({
            key: `src-${source.id}`,
            label: source.name,
            // Store sourceId explicitly — avoids fragile string parsing in removeSource.
            data: { url: source.url, sourceId: source.id },
          })),
        },
      ]);
    } catch (error) {
      console.error("Error loading feed sources:", error);
      toast.error("Unable to load feed sources.");
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const addCategory = async () => {
    if (!newCategory.trim() || !newFeedUrl.trim()) {
      return;
    }

    if (!isValidUrl(newFeedUrl)) {
      return;
    }

    setLoading(true);
    try {
      await FeedService.createFeedSource({
        name: newCategory.trim(),
        url: newFeedUrl.trim(),
      });

      await loadSources();
      setNewCategory("");
      setNewFeedUrl("");
      toast.success("Feed source saved.");
    } catch (error) {
      console.error("Error saving source:", error);
      toast.error("Unable to save feed source.");
    } finally {
      setLoading(false);
    }
  };

  const removeSource = async (key: string) => {
    // Read sourceId from data rather than parsing the display key string.
    const categoryChild = categories[0]?.children?.find((c) => c.key === key);
    const sourceId = categoryChild?.data?.sourceId;

    if (typeof sourceId !== "number" || !Number.isInteger(sourceId) || sourceId <= 0) {
      return;
    }

    setLoading(true);
    try {
      await FeedService.deleteFeedSource(sourceId);
      await loadSources();
      toast.success("Feed source removed.");
    } catch (error) {
      console.error("Error removing source:", error);
      toast.error("Unable to remove feed source.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Source Management</h1>
        <p className="mt-2 text-muted-foreground">Create categories, add feed URLs, and maintain your reading sources.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="category-name">Category Name</Label>
              <Input
                id="category-name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Security, Design, Frontend"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-url">RSS Feed URL</Label>
              <Input
                id="feed-url"
                value={newFeedUrl}
                onChange={(e) => setNewFeedUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
              />
            </div>

            <Button
              onClick={addCategory}
              disabled={!newCategory.trim() || !newFeedUrl.trim() || loading}
              className="w-full"
            >
              Save Source
            </Button>
          </CardContent>

          <CardContent className="mt-2 border-t pt-6">
            <h3 className="mb-4 text-base font-medium">Starter Sources</h3>
            <div className="space-y-3">
              {SAMPLE_FEEDS.map((feed, index) => (
                <div key={index} className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm">{feed.name}</span>
                  <Button
                    onClick={() => {
                      setNewCategory(feed.name);
                      setNewFeedUrl(feed.url);
                    }}
                    variant="ghost"
                    size="sm"
                  >
                    Use
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {categories[0]?.children?.map((category) => (
              <div key={category.key} className="rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{category.label}</h4>
                    {category.data?.url && (
                      <p className="mt-1 truncate text-sm text-muted-foreground">{category.data.url}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeSource(category.key)} disabled={loading}>Remove</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
