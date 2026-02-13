// Type definitions and interfaces for LibreRSS

export interface ItemProps {
  title?: string;
  link?: string;
  content?: string;
}

export interface Feed {
  id: number;
  url: string;
  last_fetched: Date;
  articles: Article[];
}

export interface FeedSource {
  id: number;
  name: string;
  url: string;
  category?: string;
}

export interface Article {
  id: number;
  title: string;
  link: string;
  content: string;
  publication_date: Date;
  last_checked: Date;
  feed_id: number;
}

export interface CategoryTreeNode {
  key: string;
  label: string;
  children?: CategoryTreeNode[];
  data?: { url: string; sourceId?: number; category?: string };
}
