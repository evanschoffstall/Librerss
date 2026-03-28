import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";

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

function MockThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

describe("AppThemeProvider", () => {
  beforeEach(() => {
    toasterProps.length = 0;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: window.localStorage,
    });
    window.localStorage.clear();
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
    mock.module("@/lib/hooks/useIsMobile", () => ({
      useIsMobile: () => true,
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

  test("mounts Sonner below the fixed dashboard header", async () => {
    const { AppThemeProvider } = await import("@/components/AppThemeProvider");

    const view = render(
      <AppThemeProvider>
        <div>content</div>
      </AppThemeProvider>,
    );

    await waitFor(() => {
      expect(toasterProps).toHaveLength(1);
    });

    expect(toasterProps[0]).toMatchObject({
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
      expect(toasterProps).toHaveLength(1);
    });

    fireEvent.click(view.getByTestId("toast-body-1"));

    expect(closeToastMocks[0]).toHaveBeenCalledTimes(1);
    expect(closeToastMocks[1]).not.toHaveBeenCalled();
  });

  test("uses top offset on mobile when mobile-toast-top preference is enabled", async () => {
    window.localStorage.setItem(
      "librerss:mobileToastTop",
      JSON.stringify(true),
    );

    const { AppThemeProvider } = await import("@/components/AppThemeProvider");

    render(
      <AppThemeProvider>
        <div>content</div>
      </AppThemeProvider>,
    );

    await waitFor(() => {
      expect(toasterProps.at(-1)).toMatchObject({
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
      });
    });
  });
});