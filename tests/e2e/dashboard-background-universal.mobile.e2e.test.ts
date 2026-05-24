import {
  dashboardBackgroundCanvas,
  type DashboardBackgroundTestMode,
  expectDashboardBackgroundAccelerometerInteractivity,
  expectDashboardBackgroundAmbientMotion,
  expectDashboardBackgroundHydrated,
  expectDashboardBackgroundSuspensionRecovery,
  expectDashboardBackgroundTouchInteractivity,
  gotoDashboardWithBackgroundMode,
} from "./dashboard-background-universal-support";
import { test } from "./test";

const BACKGROUND_MODES = [
  "particles",
  "stars",
] as const satisfies readonly DashboardBackgroundTestMode[];

test.describe("dashboard background universal mobile rendering", () => {
  for (const backgroundMode of BACKGROUND_MODES) {
    test(`${backgroundMode} hydrates, animates, and follows touch input`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await gotoDashboardWithBackgroundMode(page, backgroundMode);

      const canvas = dashboardBackgroundCanvas(page, backgroundMode);
      const hydratedSignature = await expectDashboardBackgroundHydrated(canvas);
      const animatedSignature = await expectDashboardBackgroundAmbientMotion(
        canvas,
        hydratedSignature,
      );

      await expectDashboardBackgroundTouchInteractivity(
        page,
        canvas,
        animatedSignature,
      );
      await expectDashboardBackgroundSuspensionRecovery(page, canvas);
    });
  }

  test("particles follow mobile accelerometer input when enabled", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoDashboardWithBackgroundMode(page, "particles", {
      mobileParticleAccelerometerEnabled: true,
      mockDeviceOrientationSupport: true,
    });

    const canvas = dashboardBackgroundCanvas(page, "particles");
    const hydratedSignature = await expectDashboardBackgroundHydrated(canvas);
    const animatedSignature = await expectDashboardBackgroundAmbientMotion(
      canvas,
      hydratedSignature,
    );

    await expectDashboardBackgroundAccelerometerInteractivity(
      page,
      canvas,
      animatedSignature,
    );
  });
});
