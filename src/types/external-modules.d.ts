declare module "sonner" {
  export const toast: {
    dismiss: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    message: (...args: unknown[]) => void;
    success: (...args: unknown[]) => void;
    warning: (...args: unknown[]) => void;
    (...args: unknown[]): void;
  };

  export const Toaster: (props: Record<string, unknown>) => JSX.Element;
}

declare module "next-themes" {
  export const ThemeProvider: (props: Record<string, unknown>) => JSX.Element;
  /**
   * Manage the theme.
   * @returns The theme state and callbacks.
   */
  export function useTheme(): {
    resolvedTheme?: string;
    setTheme: (theme: string) => void;
  };
}
