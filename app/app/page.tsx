"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Item, ItemProps } from "./components/Item";
import { Header } from "./components/Header";

export default function Home() {
  // Step 2: Initialize feed as an empty array
  const [feed, setFeed] = useState<ItemProps[]>([]);

  useEffect(() => {
    const fetchFeed = async () => {
      const response = await axios.get("/api/feed");
      // Step 3: Validate API response
      if (Array.isArray(response.data)) {
        setFeed(response.data);
      } else {
        console.error("API response is not an array:", response.data);
        // Optionally set feed to an empty array or handle differently
        setFeed([]);
      }
    };

    fetchFeed();
  }, []);

  return (
    <div className="container mx-auto px-4">
      <Header title="LibreRSS" />
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
