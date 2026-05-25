import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realMotionReactModule from "motion/react";
import * as React from "react";

import type { CategoryTreeNode } from "@/lib/core";

let feedCategoryImportVersion = 0;

type MockMotionProps = React.HTMLAttributes<HTMLElement> & {
  transition?: unknown;
  whileHover?: unknown;
  whileTap?: unknown;
};

const motion = new Proxy(
  {},
  {
    get: (_target, tag) =>
      React.forwardRef<HTMLElement, MockMotionProps>(
        function MockMotionComponent(
          {
            transition: _transition,
            whileHover: _whileHover,
            whileTap: _whileTap,
            ...props
          },
          ref,
        ) {
          return React.createElement(tag as string, {
            ...props,
            ref,
          });
        },
      ),
  },
);

async function loadFeedCategory() {
  feedCategoryImportVersion += 1;
  mock.module("motion/react", () => ({
    ...realMotionReactModule,
    motion,
  }));
  return import(
    `@/app/dashboard/components/layout/SidebarFeedCategory?test=${feedCategoryImportVersion}`
  );
}

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("FeedCategory", () => {
  test("fires intent callbacks on hover and focus before selection", async () => {
    const { SidebarFeedCategory } = await loadFeedCategory();
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
      <SidebarFeedCategory
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
