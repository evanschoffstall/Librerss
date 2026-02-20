// Type definitions and interfaces for LibreRSS

export interface ItemProps {
  title?: string;
  link?: string;
  content?: string;
}

export interface Feed {
  id: number;
  url: string;
  lastFetched: Date;
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
  publicationDate: Date;
  lastChecked: Date;
  feedId: number;
}

export interface CategoryTreeNode {
  key: string;
  label: string;
  children?: CategoryTreeNode[];
  data?: { url: string; sourceId?: number; category?: string };
}
