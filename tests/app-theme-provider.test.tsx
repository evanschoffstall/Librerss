import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realNextThemes from "next-themes";
import * as React from "react";
import * as realSonner from "sonner";

import * as realDashboardTopHeaderBar from "@/app/dashboard/components/DashboardTopHeaderBar";
import * as realUiSkeleton from "@/components/ui/skeleton";

interface MockToasterProps {
  closeButton?: boolean;
  mobileOffset?: {
    bottom?: number;
    left?: number;
    right?: number;
  };
  offset?: {
    bottom?: number;
    left?: number;
    right?: number;
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
    mock.module("@/app/dashboard/components/DashboardTopHeaderBar", () => ({
      DashboardTopHeaderBar: () => <div data-testid="mock-dashboard-header" />,
    }));
    mock.module("@/components/ui/skeleton", () => ({
      Skeleton: ({ className }: { className?: string }) => (
        <div
          className={`animate-pulse rounded-md bg-muted ${className ?? ""}`}
          data-testid="mock-skeleton"
        />
      ),
    }));
  });

  afterEach(() => {
    mock.restore();
    mock.module("next-themes", () => realNextThemes);
    mock.module("sonner", () => realSonner);
    mock.module(
      "@/app/dashboard/components/DashboardTopHeaderBar",
      () => realDashboardTopHeaderBar,
    );
    mock.module("@/components/ui/skeleton", () => realUiSkeleton);
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
});