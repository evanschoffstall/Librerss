// API service classes for LibreRSS

import axios from "axios";
import type { Article, Feed } from "../core/types";

export class FeedService {
  private static baseUrl = "/api";

  static async getFeed(url: string): Promise<Article[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/feeds?url=${encodeURIComponent(url)}`);
      if (!Array.isArray(response.data)) throw new Error("Invalid response format");
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
