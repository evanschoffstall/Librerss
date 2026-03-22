/**
 * Global Test Setup
 * Runs before all tests
 */

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, mock } from "bun:test";
// Setup happy-dom for DOM APIs in tests (e.g., DOMParser for OPML parsing)
import { Window } from "happy-dom";

import * as realApiHttpModule from "@/lib/api/http";
import * as realAuthSessionModule from "@/lib/auth/session";
import * as realConfigModule from "@/lib/config";
import * as realFeedBatchHelpersModule from "@/lib/core/feed-batch-pipeline";
import * as realDbModule from "@/lib/db/db";
import * as realFeedRecordsModule from "@/lib/db/feed-records";
import * as realFetchModule from "@/lib/fetch";
import * as realLoggerModule from "@/lib/logger";
import * as realServerModule from "@/lib/server";
import * as realServerServicesModule from "@/lib/server/services";
import * as realUrlModule from "@/lib/utils/url";

const NODE_INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");
const window = new Window();
const document = window.document;

interface InspectableElement {
  className?: string;
  id?: string;
  tagName: string;
  textContent?: null | string;
}

/** Installs a compact DOM inspector for Bun/Node output without altering runtime behavior. */
function defineCompactInspector(
  target: object,
  inspect: (this: object) => string,
): void {
  if (Object.prototype.hasOwnProperty.call(target, NODE_INSPECT_CUSTOM)) return;
  Object.defineProperty(target, NODE_INSPECT_CUSTOM, {
    configurable: true,
    value: inspect,
  });
}

/** Returns a concise inspection label for DOM elements in failed assertions. */
function summarizeElement(element: InspectableElement): string {
  const className =
    typeof element.className === "string" && element.className.trim().length > 0
      ? `.${element.className.trim().replaceAll(/\s+/g, ".")}`
      : "";
  const id = element.id ? `#${element.id}` : "";
  const text = summarizeTextContent(element.textContent ?? "");
  const textSuffix = text.length > 0 ? ` "${text}"` : "";
  return `<${element.tagName.toLowerCase()}${id}${className}>${textSuffix}`;
}

/** Returns a stable one-line summary for DOM text content. */
function summarizeTextContent(value: string): string {
  const compact = value.replaceAll(/\s+/g, " ").trim();
  return compact.length <= 48 ? compact : `${compact.slice(0, 45)}...`;
}

// Polyfill global DOM APIs for tests
global.DOMParser = window.DOMParser as any;
global.document = document as any;
global.window = window as any;
global.Window = Window as any;
global.Element = window.Element as any;
global.Event = window.Event as any;
global.CustomEvent = window.CustomEvent as any;
global.EventTarget = window.EventTarget as any;
global.HTMLElement = window.HTMLElement as any;
global.Node = window.Node as any;
global.window.SyntaxError = global.window.SyntaxError ?? SyntaxError;

defineCompactInspector(window.Window.prototype, function summarizeWindow() {
  return "[Window]";
});
defineCompactInspector(
  document.constructor.prototype,
  function summarizeDocument() {
    return "[Document]";
  },
);
defineCompactInspector(window.Node.prototype, function summarizeDomNode() {
  if (this instanceof window.Element) return summarizeElement(this);
  const constructorName = this.constructor?.name ?? "Node";
  const textContent =
    "textContent" in this && typeof this.textContent === "string"
      ? summarizeTextContent(this.textContent)
      : "";
  return textContent.length > 0
    ? `[${constructorName} "${textContent}"]`
    : `[${constructorName}]`;
});

if (typeof global.TransitionEvent !== "function") {
  class TransitionEventPolyfill extends window.Event {
    propertyName: string;

    constructor(type: string, init?: TransitionEventInit) {
      super(type, init);
      this.propertyName = init?.propertyName ?? "";
    }
  }

  global.TransitionEvent = TransitionEventPolyfill as any;
}

if (typeof global.requestAnimationFrame !== "function") {
  global.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 16)) as any;
}

if (typeof global.cancelAnimationFrame !== "function") {
  global.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as any;
}

// Set test environment variables
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `postgres://${"test"}:${"test"}@localhost:5432/librerss_test`;
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "test-session-secret-min-32-chars-long-value";
}
if (!process.env.CSRF_SECRET) {
  process.env.CSRF_SECRET = "test-csrf-secret-min-32-chars";
}
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "test-auth-secret-min-32-chars-long-value";
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  mock.restore();
  mock.module("@/lib/api/http", () => realApiHttpModule);
  mock.module("@/lib/db/db", () => realDbModule);
  mock.module("@/lib/db/feed-records", () => realFeedRecordsModule);
  mock.module("@/lib/auth/session", () => realAuthSessionModule);
  mock.module("@/lib/config", () => realConfigModule);
  mock.module(
    "@/lib/core/feed-batch-pipeline",
    () => realFeedBatchHelpersModule,
  );
  mock.module("@/lib/fetch", () => realFetchModule);
  mock.module("@/lib/logger", () => realLoggerModule);
  mock.module("@/lib/server", () => realServerModule);
  mock.module("@/lib/server/services", () => realServerServicesModule);
  mock.module("@/lib/utils/url", () => realUrlModule);
});

afterAll(() => {
  mock.restore();
});
