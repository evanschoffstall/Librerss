// Type definitions and interfaces for LibreRSS

export interface Article {
  content: string;
  feedId: number;
  feedName?: string;
  feedUrl?: string;
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

export interface CategoryTreeNode {
  children?: CategoryTreeNode[];
  data?: {
    category?: string;
    enabled?: boolean;
    extractionDisabled?: boolean;
    proxyEnabled?: boolean;
    sourceId?: number;
    url: string;
  };
  key: string;
  label: string;
}

export interface FeedSource {
  category?: string;
  enabled?: boolean;
  extractionDisabled?: boolean;
  id: number;
  name: string;
  proxyEnabled?: boolean;
  url: string;
}
