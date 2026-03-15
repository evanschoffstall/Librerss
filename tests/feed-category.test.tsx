import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { fireEvent, render } from "@testing-library/react";

import { FeedCategory } from "@/app/dashboard/components/feed/FeedCategory";
import { type CategoryTreeNode } from "@/lib";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("FeedCategory", () => {
  test("fires intent callbacks on hover and focus before selection", () => {
    const category: CategoryTreeNode = {
      children: [],
      data: {
        enabled: true,
        url: "https://example.com/feed.xml",
      },
      key: "feed-example",
      label: "Example Feed",
    };
    const onClick = mock(() => {});
    const onIntent = mock(() => {});

    const { getByRole } = render(
      <FeedCategory
        category={category}
        isActive={false}
        onClick={onClick}
        onPrefetch={onIntent}
        showFavicon={false}
      />,
    );

    const button = getByRole("button", { name: /example feed/i });

    fireEvent.mouseEnter(button);
    fireEvent.focus(button);

    expect(onIntent).toHaveBeenCalledTimes(2);
    expect(onIntent).toHaveBeenNthCalledWith(1, category);
    expect(onIntent).toHaveBeenNthCalledWith(2, category);
    expect(onClick).not.toHaveBeenCalled();
  });
});
