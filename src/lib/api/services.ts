// API service classes for LibreRSS

import axios from "axios";
import type { Article, AuthSession, AuthUser, FeedSource } from "../core/types";

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
    const response = await axios.get(
      `${this.baseUrl}/feeds?url=${encodeURIComponent(url)}`,
    );
    if (!Array.isArray(response.data)) {
      throw new Error("Invalid response format");
    }
    return response.data;
  }

  static async getFeedSources(): Promise<FeedSource[]> {
    const response = await axios.get(`${this.baseUrl}/feeds`);
    if (!Array.isArray(response.data)) {
      throw new Error("Invalid response format");
    }
    return response.data;
  }

  static async createFeedSource(
    source: Pick<FeedSource, "name" | "url"> & { category?: string },
  ): Promise<FeedSource> {
    const response = await axios.post(`${this.baseUrl}/feeds`, source);
    return response.data;
  }

  static async deleteFeedSource(id: number): Promise<FeedSource> {
    const response = await axios.delete(`${this.baseUrl}/feeds?id=${id}`);
    return response.data;
  }
}

export class ArticleService {
  private static baseUrl = "/api";

  static async getArticles(): Promise<Article[]> {
    const response = await axios.get(`${this.baseUrl}/articles`);
    return response.data;
  }
}
