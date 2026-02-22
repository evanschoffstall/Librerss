// Type definitions and interfaces for LibreRSS

export interface AuthUser {
  id: number;
  email: string;
}

export interface AuthSession {
  authenticated: boolean;
  user: AuthUser | null;
  allowSignup: boolean;
  usePlaceholderData: boolean;
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
  feedName?: string;
  feedUrl?: string;
}

export interface CategoryTreeNode {
  key: string;
  label: string;
  children?: CategoryTreeNode[];
  data?: { url: string; sourceId?: number; category?: string };
}
