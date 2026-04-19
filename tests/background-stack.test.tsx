import { cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realMotionReactModule from "motion/react";
import { useRef } from "react";

import {
  buildBackgroundStar,
  drawBackgroundStar,
  resolveBackgroundStarPointerOffset,
  updateBackgroundStar,
} from "@/app/dashboard/dashboard-components/BackgroundStars.scene";

function withRandomValues(values: number[], callback: () => void) {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => values[Math.min(index++, values.length - 1)] ?? 0;
  try {
    callback();
  } finally {
    Math.random = originalRandom;
  }
}

describe("background stack", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    cleanup();
    mock.restore();
  });

  test("builds, updates, draws, and resolves background stars", () => {
    let steadyStar: ReturnType<typeof buildBackgroundStar> | undefined;
    let twinkleStar: ReturnType<typeof buildBackgroundStar> | undefined;
    let fadeStar: ReturnType<typeof buildBackgroundStar> | undefined;

    withRandomValues([0.2, 0.95, 0.1, 0.8, 0.3, 0.6, 0.4, 0.2], () => {
      steadyStar = buildBackgroundStar({ h: 100, w: 200 }, "light");
    });
    withRandomValues([0.7, 0.6, 0.2, 0.9, 0.4, 0.7, 0.2, 0.8, 0.1], () => {
      twinkleStar = buildBackgroundStar({ h: 120, w: 240 }, "light");
    });
    withRandomValues([0.95, 0.1, 0.6, 0.2, 0.5, 0.4, 0.3, 0.2], () => {
      fadeStar = buildBackgroundStar({ h: 80, w: 160 }, "dark");
    });

    expect(steadyStar?.mode).toBe("steady");
    expect(steadyStar?.speed).toBe(0);
    expect(twinkleStar?.mode).toBe("twinkle");
    expect(twinkleStar?.colorRgb).toBe("255, 255, 255");
    expect(fadeStar?.mode).toBe("fade");
    expect(fadeStar?.colorRgb).toBe("35, 35, 35");

    const fallback = { x: 9, y: 12 };
    expect(
      resolveBackgroundStarPointerOffset({
        canvasRef: { current: null },
        canvasSize: { current: { h: 40, w: 60 } },
        event: { clientX: 0, clientY: 0 } as MouseEvent,
        fallback,
      }),
    ).toEqual(fallback);

    const canvas = {
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    } as HTMLCanvasElement;
    expect(
      resolveBackgroundStarPointerOffset({
        canvasRef: { current: canvas },
        canvasSize: { current: { h: 40, w: 60 } },
        event: { clientX: 40, clientY: 40 } as MouseEvent,
        fallback,
      }),
    ).toEqual({ x: 0, y: 0 });
    expect(
      resolveBackgroundStarPointerOffset({
        canvasRef: { current: canvas },
        canvasSize: { current: { h: 40, w: 60 } },
        event: { clientX: 400, clientY: 400 } as MouseEvent,
        fallback,
      }),
    ).toEqual(fallback);

    const save = mock();
    const translate = mock();
    const createRadialGradient = mock(() => ({ addColorStop: mock() }));
    const beginPath = mock();
    const arc = mock();
    const fill = mock();
    const restore = mock();
    const context = {
      arc,
      beginPath,
      createRadialGradient,
      fill,
      restore,
      save,
      translate,
    } as unknown as CanvasRenderingContext2D;

    drawBackgroundStar(context, steadyStar!);
    expect(save).toHaveBeenCalled();
    expect(createRadialGradient).toHaveBeenCalled();
    expect(arc).toHaveBeenCalledTimes(2);
    expect(fill).toHaveBeenCalledTimes(2);
    expect(restore).toHaveBeenCalled();

    const twinkle = twinkleStar!;
    twinkle.alpha = twinkle.maxAlpha;
    twinkle.direction = 1;
    updateBackgroundStar(twinkle, 0.5, { x: 10, y: -20 }, 50);
    expect(twinkle.direction).toBeLessThan(0);

    const fade = fadeStar!;
    fade.alpha = fade.minAlpha;
    fade.direction = -1;
    updateBackgroundStar(fade, 0.5, { x: -10, y: 20 }, 40);
    expect(fade.direction).toBeGreaterThan(0);
    expect(fade.translateX).not.toBe(0);
    expect(fade.translateY).not.toBe(0);
  });

  test("renders background layers and runs animation state transitions", async () => {
    let frameCallback: ((now: number) => void) | undefined;
    let reducedMotion = false;
    mock.module("motion/react", () => ({
      ...realMotionReactModule,
      useAnimationFrame: (callback: (now: number) => void) => {
        frameCallback = callback;
      },
      useReducedMotion: () => reducedMotion,
    }));
    mock.module(
      "@/app/dashboard/dashboard-components/BackgroundParticles",
      () => ({
        default: ({ color }: { color: string }) => <div data-particles={color} />,
      }),
    );
    mock.module(
      "@/app/dashboard/dashboard-components/BackgroundStars",
      () => ({
        default: ({ color }: { color: string }) => <div data-stars={color} />,
      }),
    );

    const { ParticlesBackground, StarsBackgroundLight } = await import(
      `@/app/dashboard/dashboard-components/Background?test=${Date.now()}-${Math.random()}`
    );
    const { useBackgroundCanvasAnimation } = await import(
      `@/app/dashboard/dashboard-components/background-hooks/useBackgroundCanvasAnimation?test=${Date.now()}-${Math.random()}`
    );

    const particles = render(<ParticlesBackground quantity={12} />);
    expect(
      particles.container.querySelector('[data-background-gradient-tone="dark"]'),
    ).toBeTruthy();
    expect(
      particles.container.querySelector('[data-background-animation-layer="particles"]'),
    ).toBeTruthy();

    const stars = render(<StarsBackgroundLight quantity={5} />);
    expect(
      stars.container.querySelector('[data-background-gradient-tone="light"]'),
    ).toBeTruthy();
    expect(stars.container.querySelector('[data-background-animation-layer="stars"]')).toBeTruthy();

    await waitFor(() => {
      expect(
        stars.container.querySelector('[data-background-surface="true"]')?.className,
      ).toContain("opacity-100");
    });

    const onFrame = mock();
    const onResume = mock();
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    const hook = renderHook(() =>
      useBackgroundCanvasAnimation({
        onFrame,
        onResume,
      }),
    );
    frameCallback?.(16);
    frameCallback?.(20);
    frameCallback?.(60);
    expect(onFrame).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    frameCallback?.(100);
    expect(onFrame).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onResume).toHaveBeenCalledTimes(1);

    reducedMotion = true;
    hook.rerender();
    frameCallback?.(140);
    expect(onFrame).toHaveBeenCalledTimes(2);

    hook.unmount();
    if (visibilityDescriptor) {
      Object.defineProperty(document, "visibilityState", visibilityDescriptor);
    }
  });

  test("renders the remaining background wrapper variants and default quantities", async () => {
    mock.module(
      "@/app/dashboard/dashboard-components/BackgroundParticles",
      () => ({
        default: ({ color }: { color: string }) => <div data-particles={color} />,
      }),
    );
    mock.module(
      "@/app/dashboard/dashboard-components/BackgroundStars",
      () => ({
        default: ({ color }: { color: string }) => <div data-stars={color} />,
      }),
    );

    const {
      ParticlesBackground,
      ParticlesBackgroundLight,
      StarsBackground,
      StarsBackgroundLight,
    } = await import(
      `@/app/dashboard/dashboard-components/Background?test=${Date.now()}-${Math.random()}`
    );
    const defaultParticles = render(<ParticlesBackground />);
    const particles = render(<ParticlesBackgroundLight quantity={3} />);
    const stars = render(<StarsBackground quantity={4} />);
    const defaultStars = render(<StarsBackgroundLight />);

    expect(
      particles.container.querySelector('[data-background-gradient-tone="light"]'),
    ).toBeTruthy();
    expect(
      particles.container.querySelector('[data-background-animation-layer="particles"]'),
    ).toBeTruthy();
    expect(stars.container.querySelector('[data-background-gradient-tone="dark"]')).toBeTruthy();
    expect(stars.container.querySelector('[data-background-animation-layer="stars"]')).toBeTruthy();
    expect(
      defaultParticles.container.querySelector('[data-background-animation-layer="particles"]'),
    ).toBeTruthy();
    expect(
      defaultStars.container.querySelector('[data-background-animation-layer="stars"]'),
    ).toBeTruthy();
  });

  test("renders background particles and wires canvas events", async () => {
    const clearRect = mock();
    const beginPath = mock();
    const arc = mock();
    const fill = mock();
    const setTransform = mock();
    const context = {
      arc,
      beginPath,
      clearRect,
      fill,
      setTransform,
    } as unknown as CanvasRenderingContext2D;
    const getContext = mock(() => context);
    const canvasPrototype = Object.getPrototypeOf(document.createElement("canvas"));
    const elementPrototype = Object.getPrototypeOf(document.createElement("div"));
    const originalGetContext = canvasPrototype.getContext;
    const offsetWidthDescriptor = Object.getOwnPropertyDescriptor(
      elementPrototype,
      "offsetWidth",
    );
    const offsetHeightDescriptor = Object.getOwnPropertyDescriptor(
      elementPrototype,
      "offsetHeight",
    );
    let animationOptions:
      | undefined
      | {
          onFrame: (now: number, delta: number) => void;
          onResume?: () => void;
        };
    let windowEventOptions:
      | undefined
      | {
          onMouseMove: (event: MouseEvent) => void;
          onResize: () => void;
        };

    Object.defineProperty(elementPrototype, "offsetWidth", {
      configurable: true,
      get: () => 160,
    });
    Object.defineProperty(elementPrototype, "offsetHeight", {
      configurable: true,
      get: () => 90,
    });
    canvasPrototype.getContext = getContext;
    mock.module("@/app/dashboard/dashboard-components/background-hooks", () => ({
      useBackgroundCanvasAnimation: (options: typeof animationOptions) => {
        animationOptions = options;
      },
      useBackgroundCanvasRefs: () => ({
        canvasContainerRef: useRef<HTMLDivElement | null>(null),
        canvasRef: useRef<HTMLCanvasElement | null>(null),
      }),
      useBackgroundCanvasWindowEvents: (options: typeof windowEventOptions) => {
        windowEventOptions = options;
      },
    }));

    const { default: BackgroundParticles } = await import(
      `@/app/dashboard/dashboard-components/BackgroundParticles?test=${Date.now()}-${Math.random()}`
    );
    const view = render(
      <BackgroundParticles
        className="particle-layer"
        color="dark"
        ease={20}
        quantity={4}
        refresh={false}
        staticity={40}
      />,
    );

    expect(view.container.querySelector("canvas")).toBeTruthy();
    expect(view.container.firstElementChild?.className).toContain("particle-layer");
    expect(setTransform).toHaveBeenCalledTimes(1);
    expect(windowEventOptions).toBeTruthy();
    expect(animationOptions).toBeTruthy();

    const canvas = view.container.querySelector("canvas") as HTMLCanvasElement;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0 }),
    });

    windowEventOptions?.onMouseMove({ clientX: 90, clientY: 60 } as MouseEvent);
    windowEventOptions?.onResize();
    animationOptions?.onFrame(120, 16);
    expect(clearRect).toHaveBeenCalled();
    expect(beginPath).toHaveBeenCalledTimes(4);
    expect(arc).toHaveBeenCalledTimes(4);
    expect(fill).toHaveBeenCalledTimes(4);

    view.rerender(
      <BackgroundParticles
        className="particle-layer"
        color="dark"
        ease={20}
        quantity={4}
        refresh={true}
        staticity={40}
      />,
    );
    expect(setTransform.mock.calls.length).toBeGreaterThanOrEqual(2);
    canvasPrototype.getContext = originalGetContext;
    if (offsetWidthDescriptor) {
      Object.defineProperty(elementPrototype, "offsetWidth", offsetWidthDescriptor);
    }
    if (offsetHeightDescriptor) {
      Object.defineProperty(elementPrototype, "offsetHeight", offsetHeightDescriptor);
    }
  });

  test("renders background stars and animates the scene", async () => {
    const clearRect = mock();
    const save = mock();
    const translate = mock();
    const gradient = { addColorStop: mock() };
    const createRadialGradient = mock(() => gradient);
    const beginPath = mock();
    const arc = mock();
    const fill = mock();
    const restore = mock();
    const setTransform = mock();
    const context = {
      arc,
      beginPath,
      clearRect,
      createRadialGradient,
      fill,
      restore,
      save,
      setTransform,
      translate,
    } as unknown as CanvasRenderingContext2D;
    const getContext = mock(() => context);
    const canvasPrototype = Object.getPrototypeOf(document.createElement("canvas"));
    const originalGetContext = canvasPrototype.getContext;
    let animationOptions:
      | undefined
      | {
          onFrame: (now: number, delta: number) => void;
        };
    let windowEventOptions:
      | undefined
      | {
          onMouseMove: (event: MouseEvent) => void;
          onResize: () => void;
        };

    canvasPrototype.getContext = getContext;
    mock.module("@/app/dashboard/dashboard-components/background-hooks", () => ({
      useBackgroundCanvasAnimation: (options: typeof animationOptions) => {
        animationOptions = options;
      },
      useBackgroundCanvasRefs: () => ({
        canvasContainerRef: useRef<HTMLDivElement | null>(null),
        canvasRef: useRef<HTMLCanvasElement | null>(null),
      }),
      useBackgroundCanvasWindowEvents: (options: typeof windowEventOptions) => {
        windowEventOptions = options;
      },
    }));

    const { default: BackgroundStars } = await import(
      `@/app/dashboard/dashboard-components/BackgroundStars?test=${Date.now()}-${Math.random()}`
    );
    const view = render(
      <BackgroundStars
        className="star-layer"
        color="light"
        ease={18}
        quantity={3}
        refresh={false}
        staticity={35}
      />,
    );

    expect(view.container.querySelector("canvas")).toBeTruthy();
    expect(view.container.firstElementChild?.className).toContain("star-layer");
    expect(setTransform).toHaveBeenCalledTimes(1);
    expect(createRadialGradient).toHaveBeenCalled();

    const canvas = view.container.querySelector("canvas") as HTMLCanvasElement;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0 }),
    });

    windowEventOptions?.onMouseMove({ clientX: 80, clientY: 45 } as MouseEvent);
    windowEventOptions?.onResize();
    animationOptions?.onFrame(140, 16);
    expect(clearRect).toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
    expect(arc).toHaveBeenCalled();
    expect(fill).toHaveBeenCalled();
    expect(restore).toHaveBeenCalled();

    view.rerender(
      <BackgroundStars
        className="star-layer"
        color="light"
        ease={18}
        quantity={3}
        refresh={true}
        staticity={35}
      />,
    );
    expect(setTransform.mock.calls.length).toBeGreaterThanOrEqual(2);
    canvasPrototype.getContext = originalGetContext;
  });
});
