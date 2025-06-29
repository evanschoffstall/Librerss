import type { Article } from "@/src/types";
import { DataView } from "primereact/dataview";
import React from "react";
import FeedItem from "./Item";

interface ItemViewProps {
  feed: Article[];
  loading?: boolean;
}

const ItemView: React.FC<ItemViewProps> = ({ feed, loading = false }) => {
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

export default ItemView;
