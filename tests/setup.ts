/**
 * Global Test Setup
 * Runs before all tests
 */

import * as realNeonServerlessModule from "@neondatabase/serverless";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, mock } from "bun:test";
import * as realDrizzleNeonServerlessModule from "drizzle-orm/neon-serverless";
// Setup happy-dom for DOM APIs in tests (e.g., DOMParser for OPML parsing)
import { Window } from "happy-dom";
import * as realMotionReactModule from "motion/react";
import * as realNextThemesModule from "next-themes";
import * as realNextNavigationModule from "next/navigation";
import * as realSonnerModule from "sonner";

import * as realBackgroundHooksModule from "@/app/dashboard/dashboard-components/background-hooks";
import * as realDashboardToolbarModule from "@/app/dashboard/dashboard-components/DashboardToolbar";
import * as realMotionSpinnerModule from "@/app/dashboard/dashboard-components/status/MotionSpinner";
import * as realUseFeedSourceActionsModule from "@/app/dashboard/dashboard-hooks/category-tree/useFeedSourceActions";
import * as realUseCategoryCrudActionsModule from "@/app/dashboard/dashboard-hooks/useCategoryCrudActions";
import * as realUseCategoryOrderStateModule from "@/app/dashboard/dashboard-hooks/useCategoryOrderState";
import * as realUseDashboardCategoryTreeModule from "@/app/dashboard/dashboard-hooks/useDashboardCategoryTree";
import * as realUseDashboardIntervalsModule from "@/app/dashboard/dashboard-hooks/useDashboardIntervals";
import * as realSettingsStateModule from "@/app/dashboard/settings-state";
import * as realToolbarModule from "@/app/dashboard/toolbar";
import * as realUiButtonModule from "@/components/ui/button";
import * as realUiDialogModule from "@/components/ui/dialog";
import * as realUiDrawerModule from "@/components/ui/drawer";
import * as realUiDropdownMenuModule from "@/components/ui/dropdown-menu";
import * as realUiInputModule from "@/components/ui/input";
import * as realUiScrollAreaModule from "@/components/ui/scroll-area";
import * as realUiSkeletonModule from "@/components/ui/skeleton";
import * as realUiTabsModule from "@/components/ui/tabs";
import * as realUiTooltipModule from "@/components/ui/tooltip";
import * as realLibModule from "@/lib";
import * as realFeedSourceReadModule from "@/lib/api/feed-source-api/read";
import * as realAuthDevAutoLoginModule from "@/lib/auth/dev-auto-login";
import * as realAuthSessionModule from "@/lib/auth/session";
import * as realDbModule from "@/lib/db/db";
import * as realFeedRecordsModule from "@/lib/db/feed-records";
import * as realNodePostgresProviderModule from "@/lib/db/node-postgres-provider";
import * as realHooksModule from "@/lib/hooks";
import * as realUseLocalStorageModule from "@/lib/hooks/useLocalStorage";
import * as realLoggerModule from "@/lib/logger";
import * as realProxyCredentialsModule from "@/lib/outbound-proxy/credentials";
import * as realProxyTransportModule from "@/lib/outbound-proxy/transport";
import * as realRateLimitModule from "@/lib/rate-limit";
import * as realServerModuleImport from "@/lib/server";
import * as realUrlModule from "@/lib/utils/url";

const NODE_INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");
const realServerModule = { ...realServerModuleImport };
const window = new Window();
const document = window.document;
const originalConsoleError = console.error;

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
global.getComputedStyle = window.getComputedStyle.bind(window) as any;
global.window.SyntaxError = global.window.SyntaxError ?? SyntaxError;

console.error = ((...args: unknown[]) => {
  const [firstArg] = args;
  if (typeof firstArg === "string") {
    if (
      firstArg.includes(
        "`NaN` is an invalid value for the `paddingBottom` css style property.",
      )
    ) {
      return;
    }
  }

  originalConsoleError(...args);
}) as typeof console.error;

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

const requestAnimationFramePolyfill = ((callback: FrameRequestCallback) =>
  setTimeout(
    () => callback(Date.now()),
    16,
  )) as unknown as typeof global.requestAnimationFrame;
const cancelAnimationFramePolyfill = ((id: number) =>
  clearTimeout(id)) as unknown as typeof global.cancelAnimationFrame;

global.requestAnimationFrame = requestAnimationFramePolyfill as any;
global.cancelAnimationFrame = cancelAnimationFramePolyfill as any;
window.requestAnimationFrame = requestAnimationFramePolyfill as any;
window.cancelAnimationFrame = cancelAnimationFramePolyfill as any;

// Set test environment variables
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `postgres://${"test"}:${"test"}@localhost:5432/librerss_test`;
}
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: "test" });
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
  delete document.documentElement.dataset.dashboardShellLoading;
  try {
    window.localStorage.clear();
  } catch {
    // Ignore tests that intentionally replace storage.clear() with a throwing stub.
  }
  try {
    window.sessionStorage.clear();
  } catch {
    // Ignore tests that intentionally replace storage.clear() with a throwing stub.
  }

  const restoreBaseMocks = () => {
    mock.restore();
    mock.module(
      "@/app/dashboard/components/MotionSpinner",
      () => realMotionSpinnerModule,
    );
    mock.module(
      "@/app/dashboard/dashboard-components/DashboardToolbar",
      () => realDashboardToolbarModule,
    );
    mock.module(
      "@/app/dashboard/dashboard-components/background-hooks",
      () => realBackgroundHooksModule,
    );
    mock.module(
      "@/app/dashboard/dashboard-hooks/useCategoryCrudActions",
      () => realUseCategoryCrudActionsModule,
    );
    mock.module(
      "@/app/dashboard/dashboard-hooks/useCategoryOrderState",
      () => realUseCategoryOrderStateModule,
    );
    mock.module(
      "@/app/dashboard/dashboard-hooks/useDashboardCategoryTree",
      () => realUseDashboardCategoryTreeModule,
    );
    mock.module(
      "@/app/dashboard/dashboard-hooks/useDashboardIntervals",
      () => realUseDashboardIntervalsModule,
    );
    mock.module(
      "@/app/dashboard/dashboard-hooks/category-tree/useFeedSourceActions",
      () => realUseFeedSourceActionsModule,
    );
    mock.module("@/app/dashboard/settings-state", () => realSettingsStateModule);
    mock.module("@/app/dashboard/toolbar", () => realToolbarModule);
    mock.module("@/lib/api/feed-source-api/read", () => realFeedSourceReadModule);
    mock.module("@/lib/auth", () => realAuthSessionModule);
    mock.module(
      "@/lib/auth/dev-auto-login",
      () => realAuthDevAutoLoginModule,
    );
    mock.module("@/lib/db/db", () => realDbModule);
    mock.module("@/lib/db/feed-records", () => realFeedRecordsModule);
    mock.module(
      "@/lib/db/node-postgres-provider",
      () => realNodePostgresProviderModule,
    );
    mock.module("@/lib/auth/session", () => realAuthSessionModule);
    mock.module("@/lib", () => realLibModule);
    mock.module("@/lib/hooks", () => realHooksModule);
    mock.module("@/lib/hooks/useLocalStorage", () => realUseLocalStorageModule);
    mock.module("@/lib/logger", () => realLoggerModule);
    mock.module(
      "@/lib/outbound-proxy/credentials",
      () => realProxyCredentialsModule,
    );
    mock.module(
      "@/lib/outbound-proxy/transport",
      () => realProxyTransportModule,
    );
    mock.module("@/lib/rate-limit", () => realRateLimitModule);
    mock.module("@/lib/server", () => realServerModule);
    mock.module("@/lib/utils/url", () => realUrlModule);
    mock.module("@neondatabase/serverless", () => realNeonServerlessModule);
    mock.module(
      "drizzle-orm/neon-serverless",
      () => realDrizzleNeonServerlessModule,
    );
    mock.module("@/components/ui/button", () => realUiButtonModule);
    mock.module("@/components/ui/dialog", () => realUiDialogModule);
    mock.module("@/components/ui/drawer", () => realUiDrawerModule);
    mock.module(
      "@/components/ui/dropdown-menu",
      () => realUiDropdownMenuModule,
    );
    mock.module("@/components/ui/input", () => realUiInputModule);
    mock.module("@/components/ui/scroll-area", () => realUiScrollAreaModule);
    mock.module("@/components/ui/skeleton", () => realUiSkeletonModule);
    mock.module("@/components/ui/tabs", () => realUiTabsModule);
    mock.module("@/components/ui/tooltip", () => realUiTooltipModule);
    mock.module("motion/react", () => realMotionReactModule);
    mock.module("next/navigation", () => realNextNavigationModule);
    mock.module("next-themes", () => realNextThemesModule);
    mock.module("sonner", () => realSonnerModule);
  };

  restoreBaseMocks();
});

afterAll(() => {
  mock.restore();
  console.error = originalConsoleError;
});
