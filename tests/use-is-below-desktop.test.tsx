import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";

type MatchMediaListener = (event: { matches: boolean }) => void;

function installMatchMedia(initialMatches = false) {
  const listeners = new Set<MatchMediaListener>();
  const addEventListener = mock(
    (_type: string, listener: MatchMediaListener) => {
      listeners.add(listener);
    },
  );
  const removeEventListener = mock(
    (_type: string, listener: MatchMediaListener) => {
      listeners.delete(listener);
    },
  );

  const mediaQueryList = {
    addEventListener,
    matches: initialMatches,
    media: "(max-width: 1023px)",
    removeEventListener,
  };

  const originalMatchMedia = window.matchMedia;
  const matchMedia = mock((query: string) => {
    expect(query).toBe("(max-width: 1023px)");
    return mediaQueryList as unknown as MediaQueryList;
  });

  window.matchMedia = matchMedia as typeof window.matchMedia;

  return {
    addEventListener,
    emit(matches: boolean) {
      mediaQueryList.matches = matches;
      for (const listener of listeners) {
        listener({ matches });
      }
    },
    matchMedia,
    removeEventListener,
    restore() {
      window.matchMedia = originalMatchMedia;
    },
  };
}

async function loadUseIsBelowDesktop() {
  const module = await import(
    `@/lib/hooks/useIsBelowDesktop?test=${Date.now()}-${Math.random()}`
  );

  return module.useIsBelowDesktop;
}

afterEach(() => {
  mock.restore();
});

describe("useIsBelowDesktop", () => {
  test("reads the initial matchMedia result and subscribes to changes", async () => {
    const env = installMatchMedia(false);

    try {
      const useIsBelowDesktop = await loadUseIsBelowDesktop();
      const { result } = renderHook(() => useIsBelowDesktop());

      expect(env.matchMedia).toHaveBeenCalledTimes(1);
      expect(result.current).toBe(false);
      expect(env.addEventListener).toHaveBeenCalledTimes(1);

      act(() => {
        env.emit(true);
      });

      expect(result.current).toBe(true);
    } finally {
      env.restore();
    }
  });

  test("cleans up the matchMedia listener on unmount", async () => {
    const env = installMatchMedia(true);

    try {
      const useIsBelowDesktop = await loadUseIsBelowDesktop();
      const { result, unmount } = renderHook(() => useIsBelowDesktop());

      expect(result.current).toBe(true);

      unmount();

      expect(env.removeEventListener).toHaveBeenCalledTimes(1);
      expect(env.removeEventListener.mock.calls[0]?.[0]).toBe("change");
    } finally {
      env.restore();
    }
  });
});
