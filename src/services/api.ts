// API service layer for feed operations

import type { Article, Feed } from "@/src/types";
import axios from "axios";

export class FeedService {
  private static baseUrl = "/api";

  static async getFeed(url: string): Promise<Article[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/feed?url=${encodeURIComponent(url)}`
      );
      
      if (!Array.isArray(response.data)) {
        throw new Error("Invalid response format");
      }
      
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
