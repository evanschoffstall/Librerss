import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
  useState,
} from "react";

import { type CategoryTreeNode } from "@/lib";

let mockedIsMobile = false;

mock.module("@/components/ui/button", () => ({
  Button: ({
    "aria-label": ariaLabel,
    children,
    className,
    disabled,
    onClick,
    size: _size,
    type = "button",
    variant: _variant,
  }: {
    "aria-label"?: string;
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    onClick?: () => void;
    size?: string;
    type?: "button" | "reset" | "submit";
    variant?: string;
  }) => (
    <button
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  ),
}));

mock.module("@/components/ui/input", () => ({
  Input: ({
    autoFocus,
    className,
    onChange,
    onKeyDown,
    placeholder,
    value,
  }: {
    autoFocus?: boolean;
    className?: string;
    onChange?: (event: { target: { value: string } }) => void;
    onKeyDown?: (event: { key: string }) => void;
    placeholder?: string;
    value?: string;
  }) => (
    <input
      autoFocus={autoFocus}
      className={className}
      onChange={(event) => {
        onChange?.({ target: { value: event.currentTarget.value } });
      }}
      onKeyDown={(event) => {
        onKeyDown?.({ key: event.key });
      }}
      placeholder={placeholder}
      value={value}
    />
  ),
}));

mock.module("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    asChild,
    children,
  }: {
    asChild?: boolean;
    children: ReactNode;
  }) => {
    if (asChild) return <>{children}</>;
    return <div>{children}</div>;
  },
}));

const DropdownMenuContext = createContext<{
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
}>({
  isOpen: false,
  setIsOpen: () => {},
});

mock.module("@/components/ui/dropdown-menu", () => {
  function DropdownMenu({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <DropdownMenuContext.Provider value={{ isOpen, setIsOpen }}>
        <div>{children}</div>
      </DropdownMenuContext.Provider>
    );
  }

  function DropdownMenuTrigger({
    asChild,
    children,
  }: {
    asChild?: boolean;
    children: ReactNode;
  }) {
    const { isOpen, setIsOpen } = useContext(DropdownMenuContext);

    if (asChild && isValidElement(children)) {
      return cloneElement(children, {
        onClick: () => {
          setIsOpen(!isOpen);
        },
      });
    }

    return (
      <button
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        type="button"
      >
        {children}
      </button>
    );
  }

  function DropdownMenuContent({ children }: { children: ReactNode }) {
    const { isOpen } = useContext(DropdownMenuContext);
    if (!isOpen) return null;
    return <div>{children}</div>;
  }

  function DropdownMenuItem({
    children,
    className,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    onSelect?: () => void;
  }) {
    return (
      <button
        className={className}
        disabled={disabled}
        onClick={() => {
          onSelect?.();
        }}
        type="button"
      >
        {children}
      </button>
    );
  }

  function DropdownMenuSeparator() {
    return <hr />;
  }

  return {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  };
});

mock.module("@/lib/hooks/useIsMobile", () => ({
  useIsMobile: () => mockedIsMobile,
}));

mock.module("@/app/dashboard/components/MotionSpinner", () => ({
  MotionSpinner: () => <span>Loading</span>,
}));

const { SettingsFeedRow } = await import(
  "@/app/dashboard/components/settings/SettingsFeedRow"
);

const TEST_FEED: CategoryTreeNode = {
  children: [],
  data: {
    enabled: true,
    extractionDisabled: false,
    proxyEnabled: false,
    url: "https://example.com/feed.xml",
  },
  key: "feed-1",
  label: "Example Feed",
};

function renderFeedRow() {
  const onStartEditing = mock(() => {});

  const result = render(
    <SettingsFeedRow
      categoryLabel="News"
      deletingKey={null}
      draggingFeedKey={null}
      editingFeedKey={null}
      editingFeedName=""
      editingFeedUrl=""
      feedDropTarget={null}
      feedNode={TEST_FEED}
      index={0}
      movingFeedKey={null}
      onCancelRename={() => {}}
      onDragEnd={() => {}}
      onDragOver={() => {}}
      onDragStart={() => {}}
      onDrop={() => {}}
      onEditingNameChange={() => {}}
      onEditingUrlChange={() => {}}
      onRemove={() => {}}
      onSaveRename={() => {}}
      onStartEditing={onStartEditing}
      onToggleEnabled={() => {}}
      onToggleExtractionDisabled={() => {}}
      onToggleProxyEnabled={() => {}}
      savingFeedKey={null}
      selectedCategory="category-1"
      togglingFeedKey={null}
      updatingSettingsKey={null}
    />,
  );

  return { ...result, onStartEditing };
}

afterEach(() => {
  mockedIsMobile = false;
});

describe("SettingsFeedRow", () => {
  test("uses an explicit desktop edit button instead of double-click editing", () => {
    mockedIsMobile = false;
    const { getByRole, getByText, onStartEditing } = renderFeedRow();

    fireEvent.doubleClick(getByText("Example Feed"));
    expect(onStartEditing).not.toHaveBeenCalled();

    fireEvent.click(getByRole("button", { name: /edit example feed/i }));

    expect(onStartEditing).toHaveBeenCalledTimes(1);
    expect(onStartEditing).toHaveBeenCalledWith(
      "feed-1",
      "Example Feed",
      "https://example.com/feed.xml",
    );
  });

  test("exposes edit inside the mobile action menu", () => {
    mockedIsMobile = true;
    const { getByRole, onStartEditing } = renderFeedRow();

    fireEvent.click(
      getByRole("button", { name: /open actions for example feed/i }),
    );
    fireEvent.click(getByRole("button", { name: /edit feed/i }));

    expect(onStartEditing).toHaveBeenCalledTimes(1);
    expect(onStartEditing).toHaveBeenCalledWith(
      "feed-1",
      "Example Feed",
      "https://example.com/feed.xml",
    );
  });
});