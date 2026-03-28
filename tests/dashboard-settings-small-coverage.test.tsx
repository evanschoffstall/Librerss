import type { ChangeEvent } from "react";

import { act, render, renderHook } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { toast } from "sonner";

import { SettingsImportSkeleton } from "@/app/dashboard/components/settings/SettingsImportSkeleton";
import { SettingsPreviewSection } from "@/app/dashboard/components/settings/SettingsPreviewSection";
import { useSettingsOpmlImportState } from "@/app/dashboard/hooks/useSettingsOpmlImportState";
import {
  DASHBOARD_PREVIEW_COOKIE_NAME,
  isDashboardPreviewModeEnabled,
  resolveDashboardPreviewMode,
  setDashboardPreviewPersistence,
} from "@/app/dashboard/preview-mode";
import { dedupeAndSortArticles, getArticleKey } from "@/app/dashboard/services/article-collection";
import {
  formatElapsed,
  isCompatibilityResultsCache,
  previewText,
} from "@/app/dashboard/services/settings-proxy";
import { DEFAULT_CATEGORY_LABEL } from "@/lib";

const originalToastError = toast.error;
const originalConsoleError = console.error;

describe("dashboard settings small coverage", () => {
  beforeEach(() => {
    mock.restore();
    document.cookie = "";
    toast.error = mock(() => "") as typeof toast.error;
    console.error = (() => {}) as typeof console.error;
  });

  afterAll(() => {
    toast.error = originalToastError;
    console.error = originalConsoleError;
    mock.restore();
  });

  test("formats elapsed proxy-check times and truncates long preview text", () => {
    expect(formatElapsed(10_000, 45_000)).toBe("35s ago");
    expect(formatElapsed(10_000, 190_000)).toBe("3m ago");
    expect(formatElapsed(10_000, 7_300_000)).toBe("2h ago");
    expect(formatElapsed(10_000, 200_000_000)).toBe("2d ago");

    expect(
      isCompatibilityResultsCache({ checkedAt: Date.now(), results: [] }),
    ).toBe(true);
    expect(isCompatibilityResultsCache(null)).toBe(false);
    expect(previewText("short text", 20)).toBe("short text");
    expect(previewText("x".repeat(12), 5)).toBe("xxxxx...");
  });

  test("resolves preview mode and persists the preview cookie", () => {
    expect(isDashboardPreviewModeEnabled("1")).toBe(true);
    expect(isDashboardPreviewModeEnabled("0")).toBe(false);
    expect(
      resolveDashboardPreviewMode({ cookieValue: null, hasPreviewQuery: true }),
    ).toBe(true);
    expect(
      resolveDashboardPreviewMode({ cookieValue: "1", hasPreviewQuery: false }),
    ).toBe(true);
    expect(
      resolveDashboardPreviewMode({ cookieValue: null, hasPreviewQuery: false }),
    ).toBe(false);

    const originalDocument = global.document;
    let cookieValue = "";
    Object.defineProperty(global, "document", {
      configurable: true,
      value: {
        get cookie() {
          return cookieValue;
        },
        set cookie(nextValue: string) {
          cookieValue = nextValue;
        },
      },
    });

    try {
      setDashboardPreviewPersistence(true);
      expect(cookieValue).toContain(`${DASHBOARD_PREVIEW_COOKIE_NAME}=1`);
      setDashboardPreviewPersistence(false);
      expect(cookieValue).toContain(`${DASHBOARD_PREVIEW_COOKIE_NAME}=`);
      expect(cookieValue).toContain("Max-Age=0");
    } finally {
      Object.defineProperty(global, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  });

  test("dedupes and sorts article collections by preferred content and recency", () => {
    const olderShortArticle = {
      content: "short",
      feedId: 1,
      id: 1,
      lastChecked: new Date("2024-01-01T00:00:00.000Z"),
      link: " https://example.com/article ",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
      title: "Older short",
    };
    const newerLongerDuplicate = {
      ...olderShortArticle,
      content: "longer article body",
      id: 2,
      publicationDate: new Date("2024-01-02T00:00:00.000Z"),
      title: "Newer duplicate",
    };
    const newestUnique = {
      ...olderShortArticle,
      content: "unique content",
      id: 3,
      link: "https://example.com/newest",
      publicationDate: new Date("2024-01-03T00:00:00.000Z"),
      title: "Newest",
    };

    expect(getArticleKey(olderShortArticle)).toBe("https://example.com/article");
    expect(
      dedupeAndSortArticles([
        olderShortArticle,
        { ...olderShortArticle, id: 4, link: "   " },
        newestUnique,
        newerLongerDuplicate,
      ]).map((article) => article.title),
    ).toEqual(["Newest", "Newer duplicate"]);
  });

  test("renders preview overlays and stable import skeleton structure", () => {
    const defaultPreview = render(
      <SettingsPreviewSection>
        <div>Editable settings</div>
      </SettingsPreviewSection>,
    );
    expect(defaultPreview.queryByText("Not available in demo mode")).toBeNull();
    expect(defaultPreview.getByText("Editable settings")).toBeTruthy();
    defaultPreview.unmount();

    const previewMode = render(
      <SettingsPreviewSection isPreviewMode={true}>
        <div>Editable settings</div>
      </SettingsPreviewSection>,
    );
    expect(previewMode.container.textContent).toContain(
      "Not available in demo mode",
    );
    expect(previewMode.getByText("Editable settings")).toBeTruthy();

    const skeleton = render(<SettingsImportSkeleton />);
    expect(skeleton.getByText("Importing feeds…")).toBeTruthy();
    expect(skeleton.container.querySelectorAll(".rounded-md.border.px-0")).toHaveLength(4);
    expect(
      skeleton.container.querySelectorAll(
        ".flex.items-center.gap-2.rounded-md.border.px-3.py-2",
      ),
    ).toHaveLength(7);
  });

  test("parses OPML files in the settings hook and handles empty or invalid imports", async () => {
    const onImportOpml = mock(async () => {});
    const { result } = renderHook(() =>
      useSettingsOpmlImportState({ onImportOpml }),
    );

    const validFile = new File(
      [
        `<opml version="2.0"><body><outline text="${DEFAULT_CATEGORY_LABEL}"><outline text="Feed" xmlUrl="https://example.com/feed.xml" /></outline></body></opml>`,
      ],
      "feeds.opml",
      { type: "text/xml" },
    );

    const validEvent = {
      currentTarget: { value: "selected-file" },
      target: { files: [validFile] },
    } as unknown as ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleOpmlFileChange(validEvent);
    });

    expect(validEvent.currentTarget.value).toBe("");
    expect(onImportOpml).toHaveBeenCalledWith([
      {
        category: DEFAULT_CATEGORY_LABEL,
        name: "Feed",
        url: "https://example.com/feed.xml",
      },
    ]);
    expect(result.current.isImportingOpml).toBe(false);

    const emptyFile = new File(
      ["<opml version=\"2.0\"><body></body></opml>"],
      "empty.opml",
      { type: "text/xml" },
    );

    await act(async () => {
      await result.current.handleOpmlFileChange({
        currentTarget: { value: "empty" },
        target: { files: [emptyFile] },
      } as unknown as ChangeEvent<HTMLInputElement>);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "No valid feeds found in this OPML file.",
    );

    const brokenFile = new File(["<invalid"], "broken.opml", {
      type: "text/xml",
    });

    await act(async () => {
      await result.current.handleOpmlFileChange({
        currentTarget: { value: "broken" },
        target: { files: [brokenFile] },
      } as unknown as ChangeEvent<HTMLInputElement>);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Unable to import this OPML file.",
    );

    await act(async () => {
      await result.current.handleOpmlFileChange({
        currentTarget: { value: "none" },
        target: { files: [] },
      } as unknown as ChangeEvent<HTMLInputElement>);
    });

    expect(onImportOpml).toHaveBeenCalledTimes(1);
  });
});