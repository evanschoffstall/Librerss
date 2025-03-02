"use client";
import axios from "axios";
import { useEffect, useState } from "react";
import ButtonBar from "./components/FeedView/ButtonBar";
import ItemView from "./components/FeedView/ItemView";
import TreeView from "./components/FeedView/TreeView";

export default function Home() {
  const [feed, setFeed] = useState<any[]>([]);
  const feedUrl = "https://feeds.bbci.co.uk/news/world/rss.xml";
  const [categories] = useState([
    {
      key: "0",
      label: "Categories",
      children: [
        {
          key: "0-0",
          label: "World News",
          data: { url: feedUrl },
        },
      ],
    },
  ]);
  const [expandedKeys] = useState<Record<string, boolean>>({});

  const fetchFeed = async () => {
    const response = await axios.get(`/api/feed?url=${encodeURIComponent(feedUrl)}`);
    if (Array.isArray(response.data)) setFeed(response.data);
    else setFeed([]);
  };

  useEffect(() => {
    fetchFeed();
  }, [feedUrl]);

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-4xl font-bold mb-4">LibreRSS</h1>
      <ButtonBar onRefresh={fetchFeed} />
      <div className="md:flex">
        <div className="md:w-1/4 md:h-full flex flex-col">
          <TreeView categories={categories} expandedKeys={expandedKeys} />
        </div>
        <ItemView feed={feed} />
      </div>
    </div>
  );
}
