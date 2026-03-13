/**
 * Test Utilities and Helpers
 * Shared utilities for testing across the codebase
 */

import type { NextRequest } from "next/server";

/**
 * Creates mock articles for testing
 */
export function createMockArticle(overrides: Partial<any> = {}) {
  return {
    author: "Test Author",
    content: "<p>Test article content</p>",
    createdAt: new Date(),
    feedId: 1,
    guid: "test-guid-123",
    id: 1,
    lastChecked: new Date(),
    link: "https://example.com/article",
    publicationDate: new Date(),
    publishedAt: new Date(),
    title: "Test Article",
    updatedAt: new Date(),
    userId: 1,
    ...overrides,
  };
}

/**
 * Creates a mock feed for testing
 */
export function createMockFeed(overrides: Partial<any> = {}) {
  return {
    createdAt: new Date(),
    description: "Test feed description",
    etag: null,
    id: 1,
    lastFetchedAt: new Date(),
    lastModified: null,
    link: "https://example.com",
    title: "Test Feed",
    updatedAt: new Date(),
    url: "https://example.com/feed.xml",
    userId: 1,
    ...overrides,
  };
}

/**
 * Creates a mock NextRequest for testing
 */
export function createMockRequest(
  url: string,
  options: {
    body?: unknown;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    method?: string;
  } = {},
): NextRequest {
  const { body, cookies = {}, headers = {}, method = "GET" } = options;

  const init: RequestInit = {
    headers: new Headers(headers),
    method,
  };

  if (body) {
    init.body = JSON.stringify(body);
    if (!headers["content-type"]) {
      (init.headers as Headers).set("content-type", "application/json");
    }
  }

  const request = new Request(url, init) as NextRequest;

  // Mock cookies
  (request as any).cookies = {
    delete: () => {},
    get: (name: string) =>
      cookies[name] ? { name, value: cookies[name] } : undefined,
    getAll: () =>
      Object.entries(cookies).map(([name, value]) => ({ name, value })),
    has: (name: string) => name in cookies,
    set: () => {},
  };

  return request;
}
