import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import * as realSonnerModule from "sonner";

import { MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY } from "@/app/dashboard/constants";
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

function MockThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

async function renderAppThemeProvider(options?: {
  isMobileGroupedLayout?: boolean;
  isMobileViewport?: boolean;
}) {
  const { isMobileGroupedLayout = true, isMobileViewport = true } =
    options ?? {};

  toasterProps.length = 0;
  window.localStorage.clear();
  window.localStorage.setItem(
    MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
    JSON.stringify(isMobileGroupedLayout),
  );
  setMobileViewport(isMobileViewport);

  const { AppThemeProvider } =
    await import("../src/components/AppThemeProvider");

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
    mock.module("next/navigation", () => ({
      usePathname: () => "/dashboard",
      useSearchParams: () => new URLSearchParams("view=dashboard"),
    }));
    mock.module("sonner", () => ({
      ...realSonnerModule,
      toast: Object.assign(() => {}, {
        ...realSonnerModule.toast,
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
                <li data-dismissible="true" data-sonner-toast="" key={index}>
                  <button data-close-button onClick={closeToast} type="button">
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
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
      writable: true,
    });
  });

  test("mounts Sonner at the true top edge when mobile top toasts are enabled by default", async () => {
    await renderAppThemeProvider();

    expect(toasterProps.at(-1)).toMatchObject({
      closeButton: true,
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

  test("does not inject a pulsing dashboard toolbar shell on the dashboard route", async () => {
    await renderAppThemeProvider();

    expect(document.body.querySelector(".animate-pulse")).toBeNull();
    expect(
      document.body.querySelector(
        ".pointer-events-none.fixed.inset-x-0.bottom-0.z-50",
      ),
    ).toBeNull();
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
      isMobileGroupedLayout: true,
      isMobileViewport: true,
      label:
        "pins mobile toasts to the true top edge when grouped layout is enabled",
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
      isMobileGroupedLayout: true,
      isMobileViewport: false,
      label:
        "keeps desktop toasts anchored at the bottom even when grouped mobile layout is enabled",
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
      isMobileGroupedLayout: false,
      isMobileViewport: true,
      label:
        "keeps mobile toasts at the bottom when grouped layout is disabled",
    },
  ])("$label", ({ expected, isMobileGroupedLayout, isMobileViewport }) => {
    expect(
      getToastPlacement({
        isMobileGroupedLayout,
        isMobileViewport,
      }),
    ).toMatchObject(expected);
  });
});
