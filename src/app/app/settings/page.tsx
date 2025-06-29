"use client";

import { isValidUrl } from "@/src/lib/utils";
import type { CategoryTreeNode } from "@/src/types";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import "primereact/resources/themes/md-dark-deeppurple/theme.css";
import { useRef, useState } from "react";
import TreeView from "../components/FeedView/TreeView";

const INITIAL_CATEGORIES: CategoryTreeNode[] = [
  {
    key: "0",
    label: "Categories",
    children: [
      {
        key: "0-0",
        label: "World News",
        data: { url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
      },
    ],
  },
];

export default function Settings() {
  const keyCounter = useRef(0);
  const [categories, setCategories] = useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");

  const addCategory = () => {
    if (!newCategory.trim()) return;

    keyCounter.current += 1;
    const newKey = keyCounter.current.toString();
    const newCategoryNode: CategoryTreeNode = {
      key: newKey,
      label: newCategory.trim(),
      children: [],
    };

    setCategories(prev => [...prev, newCategoryNode]);
    setNewCategory("");
  };

  const addFeed = () => {
    if (!newFeedUrl.trim() || !isValidUrl(newFeedUrl)) {
      // TODO: Show error message
      return;
    }

    // TODO: Implementation to add feed under selected category
    setNewFeedUrl("");
  };

  return (
    <section className="container mx-auto px-4">
      <h1 className="text-4xl font-bold mb-4">Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Category
            </label>
            <InputText
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full"
              placeholder="Enter category name"
            />
            <Button
              label="Add Category"
              icon="pi pi-plus"
              onClick={addCategory}
              className="mt-2"
              disabled={!newCategory.trim()}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Feed URL
            </label>
            <InputText
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              className="w-full"
              placeholder="https://example.com/feed.xml"
            />
            <Button
              label="Add Feed"
              icon="pi pi-plus"
              onClick={addFeed}
              className="mt-2"
              disabled={!newFeedUrl.trim() || !isValidUrl(newFeedUrl)}
            />
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Feed Categories</h2>
          <TreeView categories={categories} expandedKeys={{}} />
        </div>
      </div>
    </section>
  );
}
