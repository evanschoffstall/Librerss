/** The largest absolute tilt that maps to the full viewport parallax range. */
const MOBILE_PARTICLE_TILT_MAX_DEGREES = 45;

/**
 * Describes the browser constructor shape used by iOS orientation permission APIs.
 */
interface DeviceOrientationPermissionCapable {
  requestPermission?: () => Promise<"denied" | "granted">;
}

/**
 * Return whether the current browser advertises a touch-first mobile-like input model.
 * @returns Whether the current browser should be treated as a mobile device for particle tilt input.
 */
export function isMobileParticlePointerDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(any-pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0
  );
}

/**
 * Clamp a raw device-orientation axis into a normalized parallax input.
 * @param value - The raw beta or gamma value from the browser orientation event.
 * @returns A value in the inclusive range from `-1` to `1`.
 */
export function normalizeMobileParticleTiltAxis(value: number) {
  return Math.max(-1, Math.min(1, value / MOBILE_PARTICLE_TILT_MAX_DEGREES));
}

/** Shared public surface for mobile particle motion helper utilities. */
export const mobileParticleMotion = {
  normalizeMobileParticleTiltAxis,
  requestMobileParticleAccelerometerPermission,
  supportsMobileParticleAccelerometerMotion,
};

/**
 * Request access to mobile device orientation data when the platform requires explicit permission.
 * @returns Whether motion permission is available for the current browser session.
 */
export async function requestMobileParticleAccelerometerPermission() {
  if (!supportsMobileParticleAccelerometerMotion()) {
    return false;
  }

  const deviceOrientationConstructor =
    window.DeviceOrientationEvent as unknown as DeviceOrientationPermissionCapable;
  if (typeof deviceOrientationConstructor.requestPermission !== "function") {
    return true;
  }

  try {
    return (
      (await deviceOrientationConstructor.requestPermission()) === "granted"
    );
  } catch {
    return false;
  }
}

/**
 * Return whether mobile particle accelerometer motion is available in the current browser.
 * @returns Whether device-orientation-driven particle motion can be offered.
 */
export function supportsMobileParticleAccelerometerMotion() {
  return (
    typeof window !== "undefined" &&
    isMobileParticlePointerDevice() &&
    "DeviceOrientationEvent" in window
  );
}
