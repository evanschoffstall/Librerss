import type { Article, CategoryTreeNode } from "@/src/shared";
import { Button } from "primereact/button";
import { DataView } from "primereact/dataview";
import { Tree } from "primereact/tree";
import React from "react";

// Button Bar Component
interface ButtonBarProps {
  onRefresh: () => void;
  loading?: boolean;
}

export const ButtonBar: React.FC<ButtonBarProps> = ({ onRefresh, loading = false }) => (
  <div className="flex justify-end mb-4">
    <Button
      label="Refresh"
      icon="pi pi-refresh"
      onClick={onRefresh}
      className="p-button-secondary"
      loading={loading}
      disabled={loading}
    />
  </div>
);

// Feed Item Component
interface FeedItemProps {
  item: { title: string; link: string; content: string };
}

export const FeedItem: React.FC<FeedItemProps> = ({ item }) => (
  <a
    href={item.link}
    target="_blank"
    rel="noopener noreferrer"
    className="block p-col-12 mb-4 border border-transparent hover:border-gray-500 p-4 transition-all duration-200 text-white no-underline"
  >
    <div className="text-2xl font-bold">{item.title}</div>
    <p className="mt-2 text-gray-200">{item.content}</p>
  </a>
);

// Item View Component
interface ItemViewProps {
  feed: Article[];
  loading?: boolean;
}

export const ItemView: React.FC<ItemViewProps> = ({ feed, loading = false }) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading articles...</div>
      </div>
    );
  }

  if (feed.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg text-gray-500">No articles found</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <DataView
        value={feed}
        itemTemplate={(item) => <FeedItem item={item} />}
        layout="list"
      />
    </div>
  );
};

// Tree View Component
interface TreeViewProps {
  categories: CategoryTreeNode[];
  expandedKeys: Record<string, boolean>;
}

export const TreeView: React.FC<TreeViewProps> = ({ categories, expandedKeys }) => (
  <Tree value={categories} expandedKeys={expandedKeys} className="mb-4 flex-grow" />
);
