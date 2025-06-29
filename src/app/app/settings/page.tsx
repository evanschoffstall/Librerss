"use client";

import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import "primereact/resources/themes/md-dark-deeppurple/theme.css";
import { useRef, useState } from "react";
import TreeView from "../components/FeedView/TreeView";

export default function Settings() {
  const keyCounter = useRef(0);
  const [categories, setCategories] = useState([
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
  ]);
  const [newCategory, setNewCategory] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");

  const addCategory = () => {
    keyCounter.current += 1;
    const newKey = keyCounter.current.toString();
    setCategories([...categories, { key: newKey, label: newCategory, children: [] }]);
    setNewCategory("");
  };

  const addFeed = () => {
    // Implementation to add feed under selected category
    setNewFeedUrl("");
  };

  return (
    <section className="container mx-auto px-4">
      <h1 className="text-4xl font-bold mb-4">Settings</h1>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">New Category</label>
        <InputText value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="mt-1 block w-full" />
        <Button label="Add" icon="pi pi-plus" onClick={addCategory} className="mt-2" />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">New Feed URL</label>
        <InputText value={newFeedUrl} onChange={(e) => setNewFeedUrl(e.target.value)} className="mt-1 block w-full" />
        <Button label="Add" icon="pi pi-plus" onClick={addFeed} className="mt-2" />
      </div>
      <TreeView categories={categories} expandedKeys={{}} />
      {/* Manage user account here */}
    </section>
  );
}
