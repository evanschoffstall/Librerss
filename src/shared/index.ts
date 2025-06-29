// Consolidated shared utilities, types, constants, and services

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

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
  data?: { url: string };
}

export interface StarStyle {
  height: string;
  width: string;
  top: string;
  left: string;
  animation: string;
  willChange: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Space component constants
export const SPACE_CONSTANTS = {
  MAX_PERCENTAGE: 100,
  MAX_STAR_SIZE: 3,
  MAX_GLOW_TIME: 10,
  MAX_TWINKLE_TIME: 15,
  STAR_COUNT: 100,
} as const;

// API constants
export const API_CONSTANTS = {
  FEED_CACHE_DURATION_MINUTES: 15,
} as const;

// Environment constants
export const ENV = {
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
} as const;

// Navigation menu items
export const MENU_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/landing", label: "Home" },
  { href: "/landing/about", label: "About" },
  { href: "/landing/contact", label: "Contact" },
] as const;

// Landing page content
export const LANDING_CONTENT = {
  title: { main: "Libre", secondary: "RSS" },
  subtitle: "Reviving the free cloud tradition",
  features: ["Free", "Modern", "Cloud Service", "Reader", "No Ads", "Open Source"],
  description: {
    intro: `LibreRSS is a free cloud RSS service and reader that allows users to subscribe 
            to any RSS feed and read their favorite websites in a single place, without ads, 
            in a standardized minimalist format, across any device.`,
    mission: `In the tradition of the open internet, and in revival of the ideology of 
             Google Reader, LibreRSS provides a completely free alternative to paid RSS 
             services with no advertising or subscription fees.`,
    legacy: `Twenty years ago, Google Reader (2005-2013) was the original pioneering 
            free RSS cloud service, lasting 8 years. LibreRSS aims to capture that same 
            magic of long-lasting free accessibility and low mental overhead.`,
  },
} as const;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export const getRandomNumber = (max: number, min: number = 0): number =>
  Math.random() * (max - min) + min;

export const isClient = (): boolean => typeof window !== "undefined";

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const getTimeDifferenceInMinutes = (date1: Date, date2: Date): number => {
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// =============================================================================
// API SERVICES
// =============================================================================

import axios from "axios";

export class FeedService {
  private static baseUrl = "/api";

  static async getFeed(url: string): Promise<Article[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/feed?url=${encodeURIComponent(url)}`);
      if (!Array.isArray(response.data)) throw new Error("Invalid response format");
      return response.data;
    } catch (error) {
      console.error("Error fetching feed:", error);
      throw error;
    }
  }

  static async createFeed(feedData: Partial<Feed>): Promise<Feed> {
    try {
      const response = await axios.post(`${this.baseUrl}/feed`, feedData);
      return response.data;
    } catch (error) {
      console.error("Error creating feed:", error);
      throw error;
    }
  }

  static async updateFeed(id: number, feedData: Partial<Feed>): Promise<Feed> {
    try {
      const response = await axios.put(`${this.baseUrl}/feed/${id}`, feedData);
      return response.data;
    } catch (error) {
      console.error("Error updating feed:", error);
      throw error;
    }
  }

  static async deleteFeed(id: number): Promise<void> {
    try {
      await axios.delete(`${this.baseUrl}/feed/${id}`);
    } catch (error) {
      console.error("Error deleting feed:", error);
      throw error;
    }
  }
}

export class ArticleService {
  private static baseUrl = "/api";

  static async getArticles(): Promise<Article[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/article`);
      return response.data;
    } catch (error) {
      console.error("Error fetching articles:", error);
      throw error;
    }
  }

  static async getArticle(id: number): Promise<Article> {
    try {
      const response = await axios.get(`${this.baseUrl}/article/${id}`);
      return response.data;
    } catch (error) {
      console.error("Error fetching article:", error);
      throw error;
    }
  }
}
