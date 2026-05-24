"use client";

import { useEffect } from "react";

import { mobileParticleMotion } from "@/app/dashboard/dashboard-services";

/** Describes a viewport-relative motion input consumed by background canvas parallax. */
interface BackgroundCanvasMotionInput {
  clientX: number;
  clientY: number;
}

/** Describes the options for use background canvas window events. */
interface UseBackgroundCanvasWindowEventsOptions {
  mobileParticleAccelerometerEnabled?: boolean;
  onMotionChange: (event: BackgroundCanvasMotionInput) => void;
  onResize: () => void;
}

const MOBILE_PARTICLE_ORIENTATION_EVENT_NAME = "deviceorientation";

/**
 * Manage the background canvas window events.
 *
 * Desktop browsers keep using pointer and mouse events for parallax. Supported
 * mobile browsers can opt into device-orientation tilt so particle motion feels
 * continuous without requiring taps or drag gestures across the viewport.
 * @param options - The options used to manage the background canvas window events.
 */
export function useBackgroundCanvasWindowEvents(
  options: UseBackgroundCanvasWindowEventsOptions,
) {
  const {
    mobileParticleAccelerometerEnabled = false,
    onMotionChange,
    onResize,
  } = options;
  useEffect(() => {
    const shouldUseMobileParticleAccelerometer =
      mobileParticleAccelerometerEnabled &&
      mobileParticleMotion.supportsMobileParticleAccelerometerMotion();
    const pointerEventNames =
      "PointerEvent" in window
        ? (["pointermove", "pointerdown", "mousemove"] as const)
        : (["mousemove"] as const);
    let lastPointerX = Number.NaN;
    let lastPointerY = Number.NaN;
    /**
     * Forward a pointer-like movement event unless it repeats the exact last
     * coordinates already handled from another event family for the same
     * physical input.
     * @param event - The pointer-like input carrying viewport coordinates.
     */
    const handleMotionInput = (event: BackgroundCanvasMotionInput) => {
      if (event.clientX === lastPointerX && event.clientY === lastPointerY) {
        return;
      }

      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      onMotionChange(event);
    };

    /**
     * Forward device orientation updates after projecting tilt into viewport coordinates.
     * @param event - The device orientation event received from the browser.
     */
    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      const motionInput = resolveBackgroundCanvasOrientationMotion(event);
      if (!motionInput) {
        return;
      }

      handleMotionInput(motionInput);
    };

    if (shouldUseMobileParticleAccelerometer) {
      window.addEventListener(
        MOBILE_PARTICLE_ORIENTATION_EVENT_NAME,
        handleDeviceOrientation,
        { passive: true },
      );
    } else {
      for (const pointerEventName of pointerEventNames) {
        window.addEventListener(pointerEventName, handleMotionInput, {
          passive: true,
        });
      }
    }

    window.addEventListener("resize", onResize);

    return () => {
      if (shouldUseMobileParticleAccelerometer) {
        window.removeEventListener(
          MOBILE_PARTICLE_ORIENTATION_EVENT_NAME,
          handleDeviceOrientation,
        );
      } else {
        for (const pointerEventName of pointerEventNames) {
          window.removeEventListener(pointerEventName, handleMotionInput);
        }
      }

      window.removeEventListener("resize", onResize);
    };
  }, [mobileParticleAccelerometerEnabled, onMotionChange, onResize]);
}

/**
 * Project the current device tilt into viewport coordinates that the particle
 * parallax path already understands.
 * @param event - The browser orientation event carrying beta and gamma tilt values.
 * @returns A viewport-relative motion input, or `null` when the browser did not provide usable tilt data.
 */
function resolveBackgroundCanvasOrientationMotion(
  event: DeviceOrientationEvent,
) {
  if (event.beta === null || event.gamma === null) {
    return null;
  }

  const x = mobileParticleMotion.normalizeMobileParticleTiltAxis(event.gamma);
  const y = mobileParticleMotion.normalizeMobileParticleTiltAxis(event.beta);

  return {
    clientX: window.innerWidth / 2 + x * (window.innerWidth / 2),
    clientY: window.innerHeight / 2 + y * (window.innerHeight / 2),
  } satisfies BackgroundCanvasMotionInput;
}
