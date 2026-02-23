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
 * Creates a mock database client for testing
 */
export function createMockDb() {
  const queries: any[] = [];

  return {
    select: () => createMockSelectBuilder(queries),
    insert: () => createMockInsertBuilder(queries),
    update: () => createMockUpdateBuilder(queries),
    delete: () => createMockDeleteBuilder(queries),
    getQueries: () => queries,
    clearQueries: () => {
      queries.length = 0;
    },
  };
}

function createMockSelectBuilder(queries: any[]) {
  const query: any = { type: "select", conditions: [] };
  queries.push(query);

  return {
    from: (table: any) => {
      query.from = table;
      return {
        where: (condition: any) => {
          query.conditions.push(condition);
          return {
            limit: (n: number) => {
              query.limit = n;
              return Promise.resolve([]);
            },
            offset: (n: number) => {
              query.offset = n;
              return {
                limit: (n: number) => {
                  query.limit = n;
                  return Promise.resolve([]);
                },
              };
            },
          };
        },
        limit: (n: number) => {
          query.limit = n;
          return Promise.resolve([]);
        },
      };
    },
  };
}

function createMockInsertBuilder(queries: any[]) {
  const query: any = { type: "insert" };
  queries.push(query);

  return {
    into: (table: any) => {
      query.into = table;
      return {
        values: (values: any) => {
          query.values = values;
          return {
            returning: () => Promise.resolve([{ id: 1 }]),
            execute: () => Promise.resolve({ rowCount: 1 }),
          };
        },
      };
    },
  };
}

function createMockUpdateBuilder(queries: any[]) {
  const query: any = { type: "update" };
  queries.push(query);

  return {
    set: (values: any) => {
      query.set = values;
      return {
        where: (condition: any) => {
          query.where = condition;
          return {
            returning: () => Promise.resolve([{ id: 1 }]),
            execute: () => Promise.resolve({ rowCount: 1 }),
          };
        },
      };
    },
  };
}

function createMockDeleteBuilder(queries: any[]) {
  const query: any = { type: "delete" };
  queries.push(query);

  return {
    from: (table: any) => {
      query.from = table;
      return {
        where: (condition: any) => {
          query.where = condition;
          return {
            execute: () => Promise.resolve({ rowCount: 1 }),
          };
        },
      };
    },
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Mock timer utilities
 */
export function createMockTimer() {
  let currentTime = Date.now();

  return {
    now: () => currentTime,
    advance: (ms: number) => {
      currentTime += ms;
    },
    reset: () => {
      currentTime = Date.now();
    },
  };
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

/**
 * Sleep utility for tests
 */
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
