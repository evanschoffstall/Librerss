import { describe, expect, test } from "bun:test";

import nextConfig, {
  getHttpCloakPlatformPackageSpecifier,
} from "../next.config";

describe("next.config", () => {
  test("maps HTTPCloak native package names from the build platform", () => {
    expect(
      getHttpCloakPlatformPackageSpecifier(
        () => "linux",
        () => "x64",
      ),
    ).toBe("@httpcloak/linux-x64");
    expect(
      getHttpCloakPlatformPackageSpecifier(
        () => "darwin",
        () => "arm64",
      ),
    ).toBe("@httpcloak/darwin-arm64");
    expect(
      getHttpCloakPlatformPackageSpecifier(
        () => "freebsd",
        () => "x64",
      ),
    ).toBe("@httpcloak/linux-x64");
  });

  test("keeps HTTPCloak out of the server bundle graph", () => {
    expect(nextConfig.serverExternalPackages).toContain("httpcloak");
    expect(nextConfig.serverExternalPackages).toContain(
      getHttpCloakPlatformPackageSpecifier(),
    );
  });

  test("traces HTTPCloak runtime assets for API routes", () => {
    const apiTracingIncludes =
      nextConfig.outputFileTracingIncludes?.["/api/**"];

    expect(apiTracingIncludes).toBeDefined();
    expect(apiTracingIncludes).toContain("./node_modules/httpcloak/**");
    expect(apiTracingIncludes).toContain(
      `./node_modules/${getHttpCloakPlatformPackageSpecifier()}/**`,
    );
  });
});
