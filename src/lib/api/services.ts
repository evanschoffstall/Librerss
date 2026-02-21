// API service classes for LibreRSS

import axios from "axios";
import type {
  Article,
  AuthSession,
  AuthUser,
  Feed,
  FeedSource,
} from "../core/types";

export class AuthService {
  private static baseUrl = "/api/auth";

  static async getSession(): Promise<AuthSession> {
    const response = await axios.get(`${this.baseUrl}/session`);
    return response.data;
  }

  static async login(email: string, password: string): Promise<AuthUser> {
    const response = await axios.post(`${this.baseUrl}/login`, {
      email,
      password,
    });
    return response.data.user;
  }

  static async signup(email: string, password: string): Promise<AuthUser> {
    const response = await axios.post(`${this.baseUrl}/signup`, {
      email,
      password,
    });
    return response.data.user;
  }

  static async logout(): Promise<void> {
    await axios.post(`${this.baseUrl}/logout`);
  }
}

export class FeedService {
  private static baseUrl = "/api";

  static async getFeed(url: string): Promise<Article[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/feeds?url=${encodeURIComponent(url)}`,
      );
      if (!Array.isArray(response.data))
        throw new Error("Invalid response format");
      return response.data;
    } catch (error) {
      console.error("Error fetching feed:", error);
      throw error;
    }
  }

  static async createFeed(feedData: Partial<Feed>): Promise<Feed> {
    try {
      const response = await axios.post(`${this.baseUrl}/feeds`, feedData);
      return response.data;
    } catch (error) {
      console.error("Error creating feed:", error);
      throw error;
    }
  }

  static async updateFeed(id: number, feedData: Partial<Feed>): Promise<Feed> {
    try {
      const response = await axios.put(`${this.baseUrl}/feeds/${id}`, feedData);
      return response.data;
    } catch (error) {
      console.error("Error updating feed:", error);
      throw error;
    }
  }

  static async deleteFeed(id: number): Promise<void> {
    try {
      await axios.delete(`${this.baseUrl}/feeds/${id}`);
    } catch (error) {
      console.error("Error deleting feed:", error);
      throw error;
    }
  }

  static async getFeedSources(): Promise<FeedSource[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/feeds`);
      if (!Array.isArray(response.data))
        throw new Error("Invalid response format");
      return response.data;
    } catch (error) {
      console.error("Error fetching feed sources:", error);
      throw error;
    }
  }

  static async createFeedSource(
    source: Pick<FeedSource, "name" | "url"> & { category?: string },
  ): Promise<FeedSource> {
    try {
      const response = await axios.post(`${this.baseUrl}/feeds`, source);
      return response.data;
    } catch (error) {
      console.error("Error creating feed source:", error);
      throw error;
    }
  }

  static async deleteFeedSource(id: number): Promise<FeedSource> {
    try {
      const response = await axios.delete(`${this.baseUrl}/feeds?id=${id}`);
      return response.data;
    } catch (error) {
      console.error("Error deleting feed source:", error);
      throw error;
    }
  }
}

export class ArticleService {
  private static baseUrl = "/api";

  static async getArticles(): Promise<Article[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/articles`);
      return response.data;
    } catch (error) {
      console.error("Error fetching articles:", error);
      throw error;
    }
  }

  static async getArticle(id: number): Promise<Article> {
    try {
      const response = await axios.get(`${this.baseUrl}/articles/${id}`);
      return response.data;
    } catch (error) {
      console.error("Error fetching article:", error);
      throw error;
    }
  }
}
