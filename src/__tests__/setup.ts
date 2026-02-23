/**
 * Global Test Setup
 * Runs before all tests
 */

import * as realFeedBatchHelpersModule from "@/lib/core/feed-batch-helpers";
import * as realDbModule from "@/lib/db/db";
import * as realFeedRecordsModule from "@/lib/db/feed-records";
import * as realUrlModule from "@/lib/utils/url";
import { afterAll, afterEach, mock } from "bun:test";

// Setup happy-dom for DOM APIs in tests (e.g., DOMParser for OPML parsing)
import { Window } from "happy-dom";

const window = new Window();
const document = window.document;

// Polyfill global DOM APIs for tests
global.DOMParser = window.DOMParser as any;
global.document = document as any;
global.window = window as any;
global.Window = Window as any;
global.Element = window.Element as any;
global.HTMLElement = window.HTMLElement as any;
global.Node = window.Node as any;
global.window.SyntaxError = global.window.SyntaxError ?? SyntaxError;

if (typeof global.requestAnimationFrame !== "function") {
  global.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 16)) as any;
}

if (typeof global.cancelAnimationFrame !== "function") {
  global.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as any;
}

// Set test environment variables
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgres://test:test@localhost:5432/librerss_test";
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "test-session-secret-min-32-chars-long-value";
}
if (!process.env.CSRF_SECRET) {
  process.env.CSRF_SECRET = "test-csrf-secret-min-32-chars";
}

afterEach(() => {
  document.body.innerHTML = "";
  mock.restore();
  mock.module("@/lib/db/db", () => realDbModule);
  mock.module("@/lib/db/feed-records", () => realFeedRecordsModule);
  mock.module(
    "@/lib/core/feed-batch-helpers",
    () => realFeedBatchHelpersModule,
  );
  mock.module("@/lib/utils/url", () => realUrlModule);
});

afterAll(() => {
  mock.restore();
});
