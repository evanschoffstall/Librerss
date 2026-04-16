import type { CategoryTreeNode, FeedSource } from "@/lib/types";

// Type definitions and interfaces for LibreRSS

export interface Article {
  content: string;
  feedId: number;
  feedName?: string;
  feedUrl?: string;
  hasFullContent?: boolean;
  id: number;
  isRead?: boolean;
  isStarred?: boolean;
  lastChecked: Date;
  link: string;
  publicationDate: Date;
  title: string;
}

export interface AuthSession {
  allowSignup: boolean;
  authenticated: boolean;
  usePlaceholderData: boolean;
  user: AuthUser | null;
}

export interface AuthUser {
  email: string;
  id: number;
}

export type { CategoryTreeNode, FeedSource };
