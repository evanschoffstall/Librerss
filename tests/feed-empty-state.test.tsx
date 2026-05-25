import { render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";

import { FeedEmptyState } from "@/app/dashboard/components/feed-view/FeedEmptyState";

describe("FeedEmptyState", () => {
  test("renders the search empty state with the trimmed query token", () => {
    const { getByText } = render(
      <FeedEmptyState
        articleFilter="all"
        hasSearchTerm={true}
        trimmedSearchTerm="quantum rss"
      />,
    );

    expect(getByText("No results")).toBeTruthy();
    expect(getByText("Nothing matched")).toBeTruthy();
    expect(getByText("quantum rss")).toBeTruthy();
    expect(getByText("Try a different term.")).toBeTruthy();
  });

  test("renders the feed-setup guidance when no sources are configured", () => {
    const { container, getByText } = render(
      <FeedEmptyState
        articleFilter="all"
        hasConfiguredFeeds={false}
        hasSearchTerm={false}
        trimmedSearchTerm=""
      />,
    );

    expect(getByText("No feed sources yet")).toBeTruthy();
    expect(
      getByText("Add your feeds in Settings to start reading."),
    ).toBeTruthy();
    expect(
      container.querySelector("[data-feed-empty-state='true']"),
    ).toBeTruthy();
  });

  test("renders the starred empty state copy", () => {
    const { getByText } = render(
      <FeedEmptyState
        articleFilter="starred"
        hasSearchTerm={false}
        trimmedSearchTerm=""
      />,
    );

    expect(getByText("No starred articles yet")).toBeTruthy();
    expect(getByText("Articles you star will show up here.")).toBeTruthy();
  });

  test("renders the default up-to-date message for non-starred filters", () => {
    const { getByText } = render(
      <FeedEmptyState
        articleFilter="unread"
        hasSearchTerm={false}
        trimmedSearchTerm=""
      />,
    );

    expect(getByText("You're up to date")).toBeTruthy();
    expect(getByText("Try back later or refresh.")).toBeTruthy();
  });
});
