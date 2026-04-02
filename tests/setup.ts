/**
 * Global Test Setup
 * Runs before all tests
 */

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, mock } from "bun:test";
// Setup happy-dom for DOM APIs in tests (e.g., DOMParser for OPML parsing)
import { Window } from "happy-dom";
import * as realNextThemesModule from "next-themes";
import * as realNextNavigationModule from "next/navigation";

import * as realFeedListModule from "@/app/dashboard/components/feed/FeedList";
import * as realSettingsAccountSectionModule from "@/app/dashboard/components/settings/SettingsAccountSection";
import * as realSettingsDisplaySectionModule from "@/app/dashboard/components/settings/SettingsDisplaySection";
import * as realSettingsFeedManagementSectionModule from "@/app/dashboard/components/settings/SettingsFeedManagementSection";
import * as realSettingsPanelModule from "@/app/dashboard/components/settings/SettingsPanel";
import * as realSettingsProxySectionModule from "@/app/dashboard/components/settings/SettingsProxySection";
import * as realDashboardViewModule from "@/app/dashboard/DashboardView";
import * as realUseCategoryCrudActionsModule from "@/app/dashboard/hooks/useCategoryCrudActions";
import * as realUseCategoryOrderStateModule from "@/app/dashboard/hooks/useCategoryOrderState";
import * as realUseDashboardCategoryTreeModule from "@/app/dashboard/hooks/useDashboardCategoryTree";
import * as realUseDashboardIntervalsModule from "@/app/dashboard/hooks/useDashboardIntervals";
import * as realUseFeedSourceActionsModule from "@/app/dashboard/hooks/useFeedSourceActions";
import * as realUseSettingsModalStateModule from "@/app/dashboard/hooks/useSettingsModalState";
import * as realUseSettingsProxyStateModule from "@/app/dashboard/hooks/useSettingsProxyState";
import * as realCategoryOperationsModule from "@/app/dashboard/services/category-operations";
import * as realCategoryTreeModule from "@/app/dashboard/services/category-tree";
import * as realFeedSourceOperationsModule from "@/app/dashboard/services/feed-source-operations";
import * as realOpmlImportModule from "@/app/dashboard/services/opml-import";
import * as realUiButtonModule from "@/components/ui/button";
import * as realUiDialogModule from "@/components/ui/dialog";
import * as realUiDrawerModule from "@/components/ui/drawer";
import * as realUiDropdownMenuModule from "@/components/ui/dropdown-menu";
import * as realUiInputModule from "@/components/ui/input";
import * as realUiScrollAreaModule from "@/components/ui/scroll-area";
import * as realUiSkeletonModule from "@/components/ui/skeleton";
import * as realUiTabsModule from "@/components/ui/tabs";
import * as realUiTooltipModule from "@/components/ui/tooltip";
import * as realApiHttpModule from "@/lib/api/http";
import * as realAuthSessionModule from "@/lib/auth/session";
import * as realConfigModule from "@/lib/config";
import * as realFeedBatchHelpersModule from "@/lib/core/feed-batch-pipeline";
import * as realDbModule from "@/lib/db/db";
import * as realFeedRecordsModule from "@/lib/db/feed-records";
import * as realFetchModule from "@/lib/fetch";
import * as realUseIsMobileModule from "@/lib/hooks/useIsMobile";
import * as realUseLocalStorageModule from "@/lib/hooks/useLocalStorage";
import * as realUseSessionStateModule from "@/lib/hooks/useSessionState";
import * as realUseWebStorageModule from "@/lib/hooks/useWebStorage";
import * as realLoggerModule from "@/lib/logger";
import * as realServerModule from "@/lib/server";
import * as realServerServicesModule from "@/lib/server/services";
import * as realUrlModule from "@/lib/utils/url";

const NODE_INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");
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
    if (firstArg.includes("`NaN` is an invalid value for the `paddingBottom` css style property.")) {
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
  setTimeout(() => callback(Date.now()), 16)) as unknown as typeof global.requestAnimationFrame;
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

  const restoreBaseMocks = () => {
    mock.restore();
    mock.module("@/lib/api/http", () => realApiHttpModule);
    mock.module("@/app/dashboard/DashboardView", () => realDashboardViewModule);
    mock.module("@/app/dashboard/components/feed/FeedList", () => realFeedListModule);
    mock.module(
      "@/app/dashboard/components/settings/SettingsAccountSection",
      () => realSettingsAccountSectionModule,
    );
    mock.module(
      "@/app/dashboard/components/settings/SettingsDisplaySection",
      () => realSettingsDisplaySectionModule,
    );
    mock.module(
      "@/app/dashboard/components/settings/SettingsFeedManagementSection",
      () => realSettingsFeedManagementSectionModule,
    );
    mock.module(
      "@/app/dashboard/components/settings/SettingsPanel",
      () => realSettingsPanelModule,
    );
    mock.module(
      "@/app/dashboard/components/settings/SettingsProxySection",
      () => realSettingsProxySectionModule,
    );
    mock.module(
      "@/app/dashboard/hooks/useSettingsModalState",
      () => realUseSettingsModalStateModule,
    );
    mock.module(
      "@/app/dashboard/hooks/useSettingsProxyState",
      () => realUseSettingsProxyStateModule,
    );
    mock.module(
      "@/app/dashboard/hooks/useCategoryCrudActions",
      () => realUseCategoryCrudActionsModule,
    );
    mock.module(
      "@/app/dashboard/hooks/useCategoryOrderState",
      () => realUseCategoryOrderStateModule,
    );
    mock.module(
      "@/app/dashboard/hooks/useDashboardCategoryTree",
      () => realUseDashboardCategoryTreeModule,
    );
    mock.module(
      "@/app/dashboard/hooks/useDashboardIntervals",
      () => realUseDashboardIntervalsModule,
    );
    mock.module(
      "@/app/dashboard/hooks/useFeedSourceActions",
      () => realUseFeedSourceActionsModule,
    );
    mock.module(
      "@/app/dashboard/services/category-operations",
      () => realCategoryOperationsModule,
    );
    mock.module(
      "@/app/dashboard/services/category-tree",
      () => realCategoryTreeModule,
    );
    mock.module(
      "@/app/dashboard/services/feed-source-operations",
      () => realFeedSourceOperationsModule,
    );
    mock.module(
      "@/app/dashboard/services/opml-import",
      () => realOpmlImportModule,
    );
    mock.module("@/lib/db/db", () => realDbModule);
    mock.module("@/lib/db/feed-records", () => realFeedRecordsModule);
    mock.module("@/lib/auth/session", () => realAuthSessionModule);
    mock.module("@/lib/config", () => realConfigModule);
    mock.module(
      "@/lib/core/feed-batch-pipeline",
      () => realFeedBatchHelpersModule,
    );
    mock.module("@/lib/fetch", () => realFetchModule);
    mock.module("@/lib/hooks/useIsMobile", () => realUseIsMobileModule);
    mock.module("@/lib/hooks/useLocalStorage", () => realUseLocalStorageModule);
    mock.module("@/lib/hooks/useSessionState", () => realUseSessionStateModule);
    mock.module("@/lib/hooks/useWebStorage", () => realUseWebStorageModule);
    mock.module("@/lib/logger", () => realLoggerModule);
    mock.module("@/lib/server", () => realServerModule);
    mock.module("@/lib/server/services", () => realServerServicesModule);
    mock.module("@/lib/utils/url", () => realUrlModule);
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
    mock.module("next/navigation", () => realNextNavigationModule);
    mock.module("next-themes", () => realNextThemesModule);
  };

  restoreBaseMocks();
  queueMicrotask(restoreBaseMocks);
});

afterAll(() => {
  mock.restore();
  console.error = originalConsoleError;
});
