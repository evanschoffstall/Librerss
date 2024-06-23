"use client";
// pages/index.tsx
import { useEffect, useState } from "react";
import axios from "axios";
import Parser, { Output, Item as RssItem } from "rss-parser";
import { Item } from "./components/Item";
import { Header } from "./components/Header";
import { Container } from "./components/Container";

const parser = new Parser();

type Feed = Output<RssItem>;

export default function Home() {
  const [feed, setFeed] = useState<Feed | undefined>();

  useEffect(() => {
    const fetchFeed = async () => {
      const response = await axios.get("/api/feed");
      setFeed(response.data);
    };

    fetchFeed();
  }, []);

  return (
    <Container>
      <Header title="Cloud RSS Reader" />
      {feed?.items.map((item, index) => (
        <Item
          key={index}
          title={item.title}
          link={item.link}
          content={item.content}
        />
      ))}
    </Container>
  );
}
