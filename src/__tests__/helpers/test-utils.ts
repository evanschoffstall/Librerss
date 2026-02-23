/**
 * Test Utilities and Helpers
 * Shared utilities for testing across the codebase
 */

import type { NextRequest } from "next/server";

/**
 * Creates a mock NextRequest for testing
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    cookies?: Record<string, string>;
  } = {},
): NextRequest {
  const { method = "GET", headers = {}, body, cookies = {} } = options;

  const init: RequestInit = {
    method,
    headers: new Headers(headers),
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
    get: (name: string) =>
      cookies[name] ? { name, value: cookies[name] } : undefined,
    set: () => {},
    delete: () => {},
    has: (name: string) => name in cookies,
    getAll: () =>
      Object.entries(cookies).map(([name, value]) => ({ name, value })),
  };

  return request;
}

/**
 * Creates a mock feed for testing
 */
export function createMockFeed(overrides: Partial<any> = {}) {
  return {
    id: 1,
    url: "https://example.com/feed.xml",
    title: "Test Feed",
    description: "Test feed description",
    link: "https://example.com",
    lastFetchedAt: new Date(),
    lastModified: null,
    etag: null,
    userId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates mock articles for testing
 */
export function createMockArticle(overrides: Partial<any> = {}) {
  return {
    id: 1,
    feedId: 1,
    guid: "test-guid-123",
    title: "Test Article",
    content: "<p>Test article content</p>",
    link: "https://example.com/article",
    publishedAt: new Date(),
    author: "Test Author",
    userId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
