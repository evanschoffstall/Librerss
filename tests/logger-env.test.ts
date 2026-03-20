import { describe, expect, test } from "bun:test";

describe("logger env fallback", () => {
  const loggerModuleUrl = new URL("../src/lib/logger.ts", import.meta.url).href;
  const readSupportsColor = (envSetupScript: string) => {
    const processResult = Bun.spawnSync({
      cmd: [
        process.execPath,
        "--eval",
        `${envSetupScript}\nimport { Logger } from ${JSON.stringify(loggerModuleUrl)}; const logger = new Logger(); console.log(logger["supportsColor"]());`,
      ],
      cwd: process.cwd(),
      env: process.env,
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(processResult.exitCode).toBe(0);
    expect(processResult.stderr.toString().trim()).toBe("");

    return processResult.stdout.toString().trim();
  };

  test("uses build-time LOG_COLORS_ENABLED fallback when runtime env is unset", () => {
    const supportsColor = readSupportsColor(
      `process.env.LIBRERSS_BUILD_CONFIG = ${JSON.stringify(JSON.stringify({ LOG_COLORS_ENABLED: "false", LOG_LEVEL: "info" }))}; delete process.env.LOG_COLORS_ENABLED; process.env.NODE_ENV = "production";`,
    );

    expect(supportsColor).toBe("false");
  });

  test("prefers runtime LOG_COLORS_ENABLED over build-time fallback", () => {
    const supportsColor = readSupportsColor(
      `process.env.LIBRERSS_BUILD_CONFIG = ${JSON.stringify(JSON.stringify({ LOG_COLORS_ENABLED: "false", LOG_LEVEL: "info" }))}; process.env.LOG_COLORS_ENABLED = "true"; process.env.NODE_ENV = "production";`,
    );

    expect(supportsColor).toBe("true");
  });
});