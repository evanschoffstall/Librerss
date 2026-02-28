declare module "sonner" {
  export const toast: {
    success: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warning: (...args: unknown[]) => void;
    message: (...args: unknown[]) => void;
    dismiss: (...args: unknown[]) => void;
    (...args: unknown[]): void;
  };

  export const Toaster: (props: Record<string, unknown>) => JSX.Element;
}

declare module "next-themes" {
  export const ThemeProvider: (props: Record<string, unknown>) => JSX.Element;
  export function useTheme(): {
    resolvedTheme?: string;
    setTheme: (theme: string) => void;
  };
}
