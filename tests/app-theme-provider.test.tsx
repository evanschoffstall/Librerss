import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";

import {
  MOBILE_TOAST_TOP_STORAGE_KEY,
  MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY,
} from "@/app/dashboard/constants";
import { getToastPlacement } from "@/components/AppThemeProvider";

interface MockToasterProps {
  closeButton?: boolean;
  mobileOffset?: {
    bottom?: number;
    left?: number;
    right?: number;
    top?: number;
  };
  offset?: {
    bottom?: number;
    left?: number;
    right?: number;
    top?: number;
  };
  position?: string;
  toastOptions?: {
    classNames?: Record<string, string>;
    style?: {
      justifyContent?: string;
      textAlign?: string;
    };
  };
}

const toasterProps: MockToasterProps[] = [];
const closeToastMocks = [mock(() => {}), mock(() => {})];
const originalMatchMedia = window.matchMedia;
let currentIsMobileToastTop = false;
let currentIsMobileToolbarBottom = true;

function MockThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

async function renderAppThemeProvider(options?: {
  isMobileToastTop?: boolean;
  isMobileToolbarBottom?: boolean;
  isMobileViewport?: boolean;
}) {
  const {
    isMobileToastTop = false,
    isMobileToolbarBottom = true,
    isMobileViewport = true,
  } = options ?? {};

  currentIsMobileToastTop = isMobileToastTop;
  currentIsMobileToolbarBottom = isMobileToolbarBottom;

  toasterProps.length = 0;
  window.localStorage.clear();
  window.localStorage.setItem(
    MOBILE_TOAST_TOP_STORAGE_KEY,
    JSON.stringify(isMobileToastTop),
  );
  window.localStorage.setItem(
    MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY,
    JSON.stringify(isMobileToolbarBottom),
  );
  setMobileViewport(isMobileViewport);

  const { AppThemeProvider } = await import("../src/components/AppThemeProvider");

  render(
    <AppThemeProvider>
      <div>content</div>
    </AppThemeProvider>,
  );

  await waitFor(() => {
    expect(toasterProps.length).toBeGreaterThan(0);
  });
}

function setMobileViewport(enabled: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => false,
      matches: query.includes("max-width") ? enabled : false,
      media: query,
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {},
    }),
  });
}

describe("AppThemeProvider", () => {
  beforeEach(() => {
    toasterProps.length = 0;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: window.localStorage,
      writable: true,
    });
    window.localStorage.clear();
    setMobileViewport(true);
    for (const closeToastMock of closeToastMocks) {
      closeToastMock.mockClear();
    }
    mock.restore();

    mock.module("next-themes", () => ({
      ThemeProvider: MockThemeProvider,
      useTheme: () => ({ resolvedTheme: "dark", setTheme: mock(() => {}) }),
    }));
    mock.module("@/lib/hooks/useLocalStorage", () => ({
      useLocalStorage: (key: string, initialValue: boolean) => {
        if (key === MOBILE_TOAST_TOP_STORAGE_KEY) {
          return [currentIsMobileToastTop, mock(() => {})] as const;
        }

        if (key === MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY) {
          return [currentIsMobileToolbarBottom, mock(() => {})] as const;
        }

        return [initialValue, mock(() => {})] as const;
      },
    }));
    mock.module("next/navigation", () => ({
      usePathname: () => "/dashboard",
      useSearchParams: () => new URLSearchParams("view=dashboard"),
    }));
    mock.module("sonner", () => ({
      toast: Object.assign(() => {}, {
        error: () => {},
        info: () => {},
        success: () => {},
      }),
      Toaster: (props: MockToasterProps) => {
        toasterProps.push(props);
        return (
          <div data-testid="mock-toaster">
            <ol>
              {closeToastMocks.map((closeToast, index) => (
                <li
                  data-dismissible="true"
                  data-sonner-toast=""
                  key={index}
                >
                  <button
                    data-close-button
                    onClick={closeToast}
                    type="button"
                  >
                    Close toast {index + 1}
                  </button>
                  <div data-testid={`toast-body-${index + 1}`}>
                    Toast body {index + 1}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      },
    }));
    mock.module("@/app/dashboard/components/DashboardToolbar", () => ({
      DashboardToolbar: () => <div data-testid="mock-dashboard-toolbar" />,
    }));
    mock.module("@/components/ui/skeleton", () => ({
      Skeleton: () => <div data-testid="mock-skeleton" />,
    }));
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
      writable: true,
    });
  });

  test("mounts Sonner below the fixed dashboard header", async () => {
    await renderAppThemeProvider();

    expect(toasterProps.at(-1)).toMatchObject({
      closeButton: true,
      mobileOffset: {
        bottom: 16,
        left: 16,
        right: 16,
      },
      offset: {
        bottom: 16,
        left: 16,
        right: 16,
      },
      position: "bottom-right",
      toastOptions: {
        classNames: {
          closeButton: "!bg-background !border-border/50",
          description: "!text-muted-foreground",
          toast:
            "!rounded-xl !border-border/50 !bg-background/95 !shadow-lg !backdrop-blur-sm",
        },
        style: {
          justifyContent: "flex-start",
          textAlign: "left",
        },
      },
    });
  });

  test("clicking a toast body dismisses only the clicked toast", async () => {
    const { AppThemeProvider } = await import("@/components/AppThemeProvider");

    const view = render(
      <AppThemeProvider>
        <div>content</div>
      </AppThemeProvider>,
    );

    await waitFor(() => {
      expect(toasterProps.length).toBeGreaterThan(0);
    });

    fireEvent.click(view.getByTestId("toast-body-1"));

    expect(closeToastMocks[0]).toHaveBeenCalledTimes(1);
    expect(closeToastMocks[1]).not.toHaveBeenCalled();
  });

  test.each([
    {
      expected: {
        mobileOffset: {
          left: 16,
          right: 16,
          top: 16,
        },
        offset: {
          left: 16,
          right: 16,
          top: 16,
        },
        position: "top-right",
      },
      isMobileToastTop: true,
      isMobileToolbarBottom: true,
      isMobileViewport: true,
      label:
        "pins top toasts to the true top edge when the mobile toolbar lives at the bottom",
    },
    {
      expected: {
        mobileOffset: {
          left: 16,
          right: 16,
          top: 63,
        },
        offset: {
          left: 16,
          right: 16,
          top: 63,
        },
        position: "top-right",
      },
      isMobileToastTop: true,
      isMobileToolbarBottom: false,
      isMobileViewport: true,
      label:
        "keeps a toolbar clearance when the mobile toolbar is pinned to the top",
    },
    {
      expected: {
        mobileOffset: {
          bottom: 16,
          left: 16,
          right: 16,
        },
        offset: {
          bottom: 16,
          left: 16,
          right: 16,
        },
        position: "bottom-right",
      },
      isMobileToastTop: true,
      isMobileToolbarBottom: true,
      isMobileViewport: false,
      label:
        "keeps desktop toasts anchored at the bottom even when the mobile top-toast preference is enabled",
    },
    {
      expected: {
        mobileOffset: {
          bottom: 16,
          left: 16,
          right: 16,
        },
        offset: {
          bottom: 16,
          left: 16,
          right: 16,
        },
        position: "bottom-right",
      },
      isMobileToastTop: false,
      isMobileToolbarBottom: false,
      isMobileViewport: true,
      label:
        "keeps mobile toasts at the bottom when the top-toast preference is disabled",
    },
  ])(
    "$label",
    ({
      expected,
      isMobileToastTop,
      isMobileToolbarBottom,
      isMobileViewport,
    }) => {
      expect(
        getToastPlacement({
          isMobileToastTop,
          isMobileToolbarBottom,
          isMobileViewport,
        }),
      ).toMatchObject(expected);
    },
  );
});