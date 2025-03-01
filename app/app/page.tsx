"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { Item, ItemProps } from "./components/Item";

export default function Home() {
  const [feed, setFeed] = useState<ItemProps[]>([]);
  const feedUrl = "https://feeds.bbci.co.uk/news/world/rss.xml"; // Example feed URL

  useEffect(() => {
    const fetchFeed = async () => {
      const response = await axios.get(`/api/feed?url=${encodeURIComponent(feedUrl)}`);
      if (Array.isArray(response.data)) {
        setFeed(response.data);
      } else {
        console.error("API response is not an array:", response.data);
        setFeed([]);
      }
    };

    fetchFeed();
  }, [feedUrl]);

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-4xl font-bold mb-4">LibreRSS</h1>
      {feed.length > 0 ? (
        feed.map((item, index) => (
          <Item
            key={index}
            title={item.title}
            link={item.link}
            content={item.content}
          />
        ))
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}
