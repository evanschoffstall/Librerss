import type { CategoryTreeNode, FeedSource } from "@/lib/types";

// Type definitions and interfaces for LibreRSS

/**
 * Describes the article.
 */
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

/**
 * Describes the auth session.
 */
export interface AuthSession {
  allowSignup: boolean;
  authenticated: boolean;
  canManageInvitations: boolean;
  invitationsEnabled: boolean;
  usePlaceholderData: boolean;
  user: AuthUser | null;
}

/**
 * Describes the auth user.
 */
export interface AuthUser {
  email: string;
  id: number;
}

export type { CategoryTreeNode, FeedSource };
