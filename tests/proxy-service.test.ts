import { afterEach, describe, expect, mock, test } from "bun:test";

import { ServerServiceError } from "@/lib/server/services/errors";

afterEach(() => {
  mock.restore();
});

function mockProxyServiceDeps(options: {
  materializeImpl?: (
    storedPassword: null | string,
    persistNormalizedPassword: (normalizedStoredPassword: string) => Promise<void>,
  ) => Promise<null | string>;
  probeResult?: boolean;
  rows: {
    allowInsecureTls?: boolean;
    proxyPassword?: null | string;
    proxyUrl?: null | string;
    proxyUsername?: null | string;
  }[];
}) {
  const loggerError = mock(() => {});
  const probeProxy = mock(async () => options.probeResult ?? true);
  const limit = mock(async () => options.rows);
  const updateWhere = mock(async () => undefined);
  const updateSet = mock(
    (_values: {
      proxyPassword?: null | string;
    }) => ({
      where: updateWhere,
    }),
  );
  const materializeStoredProxyPassword =
    options.materializeImpl ??
    mock(async (storedPassword: null | string) => storedPassword);

  mock.module("@/lib/db/db", () => ({
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit,
          }),
        }),
      }),
      update: () => ({
        set: updateSet,
      }),
    }),
  }));
  mock.module("@/lib/logger", () => ({
    logger: {
      debug: mock(() => {}),
      error: loggerError,
      info: mock(() => {}),
      warn: mock(() => {}),
    },
  }));
  mock.module("@/lib/server/proxy", () => ({
    probeProxy,
  }));
  mock.module("@/lib/server/proxy-credentials", () => ({
    materializeStoredProxyPassword,
  }));

  return {
    limit,
    loggerError,
    materializeStoredProxyPassword,
    probeProxy,
    updateSet,
    updateWhere,
  };
}

describe("server proxy service", () => {
  test("getProxyStatus reports an unconfigured proxy when no row exists", async () => {
    const deps = mockProxyServiceDeps({ rows: [] });
    const { getProxyStatus } = await import(
      `@/lib/server/services/proxy-service?status-empty=${Date.now()}`
    );

    await expect(getProxyStatus(42)).resolves.toEqual({
      configured: false,
      proxyUrl: null,
      status: "unreachable",
    });
    expect(deps.probeProxy).not.toHaveBeenCalled();
  });

  test("getProxyStatus strips credentials and logs unreachable proxies", async () => {
    const deps = mockProxyServiceDeps({
      probeResult: false,
      rows: [
        {
          proxyUrl: "http://reader:secret@proxy.example:8080",
        },
      ],
    });
    const { getProxyStatus } = await import(
      `@/lib/server/services/proxy-service?status-unreachable=${Date.now()}`
    );

    await expect(getProxyStatus(7)).resolves.toEqual({
      configured: true,
      proxyUrl: "http://proxy.example:8080",
      status: "unreachable",
    });
    expect(deps.probeProxy).toHaveBeenCalledWith(
      "http://reader:secret@proxy.example:8080",
    );
    expect(deps.loggerError).toHaveBeenCalledWith(
      "Proxy status check: unreachable",
      {
        proxyUrl: "http://proxy.example:8080",
      },
    );
  });

  test("resolveUserProxy returns no proxy when the user has no saved row", async () => {
    const deps = mockProxyServiceDeps({ rows: [] });
    const { resolveUserProxy } = await import(
      `@/lib/server/services/proxy-service?resolve-empty=${Date.now()}`
    );

    await expect(resolveUserProxy(7)).resolves.toEqual({
      allowInsecureTls: false,
      proxyUrl: undefined,
    });
    expect(deps.materializeStoredProxyPassword).not.toHaveBeenCalled();
  });

  test("resolveUserProxy injects materialized credentials into the sanitized proxy URL", async () => {
    const deps = mockProxyServiceDeps({
      materializeImpl: async (_storedPassword, persistNormalizedPassword) => {
        await persistNormalizedPassword("enc-v1:normalized");
        return "stored-pass";
      },
      rows: [
        {
          allowInsecureTls: true,
          proxyPassword: "legacy-ciphertext",
          proxyUrl: "http://embedded-user:embedded-pass@proxy.example:8080",
          proxyUsername: "stored-user",
        },
      ],
    });
    const { resolveUserProxy } = await import(
      `@/lib/server/services/proxy-service?resolve-credentials=${Date.now()}`
    );

    await expect(resolveUserProxy(9)).resolves.toEqual({
      allowInsecureTls: true,
      proxyUrl: "http://stored-user:stored-pass@proxy.example:8080/",
    });
    expect(deps.updateSet).toHaveBeenCalledWith({
      proxyPassword: "enc-v1:normalized",
    });
    expect(deps.updateWhere).toHaveBeenCalledTimes(1);
  });

  test("resolveUserProxy falls back to embedded credentials when no stored ones exist", async () => {
    mockProxyServiceDeps({
      materializeImpl: async () => null,
      rows: [
        {
          allowInsecureTls: false,
          proxyPassword: null,
          proxyUrl: "http://embedded-user:embedded-pass@proxy.example:8080",
          proxyUsername: null,
        },
      ],
    });
    const { resolveUserProxy } = await import(
      `@/lib/server/services/proxy-service?resolve-embedded=${Date.now()}`
    );

    await expect(resolveUserProxy(10)).resolves.toEqual({
      allowInsecureTls: false,
      proxyUrl: "http://embedded-user:embedded-pass@proxy.example:8080/",
    });
  });

  test("resolveUserProxy restores the default SOCKS port for legacy stored URLs", async () => {
    mockProxyServiceDeps({
      materializeImpl: async () => "stored-pass",
      rows: [
        {
          allowInsecureTls: false,
          proxyPassword: "enc-v1:stored",
          proxyUrl: "socks5://proxy.example",
          proxyUsername: "stored-user",
        },
      ],
    });
    const { resolveUserProxy } = await import(
      `@/lib/server/services/proxy-service?resolve-socks-default-port=${Date.now()}`
    );

    await expect(resolveUserProxy(12)).resolves.toEqual({
      allowInsecureTls: false,
      proxyUrl: "socks5://stored-user:stored-pass@proxy.example:1080",
    });
  });

  test("resolveUserProxy wraps unreadable saved passwords in a ServiceError", async () => {
    const deps = mockProxyServiceDeps({
      materializeImpl: async () => {
        throw new Error("ciphertext unreadable");
      },
      rows: [
        {
          allowInsecureTls: false,
          proxyPassword: "enc-v1:broken",
          proxyUrl: "http://proxy.example:8080",
          proxyUsername: "stored-user",
        },
      ],
    });
    const { resolveUserProxy } = await import(
      `@/lib/server/services/proxy-service?resolve-error=${Date.now()}`
    );

    let thrownError: unknown;
    try {
      await resolveUserProxy(11);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(ServerServiceError);
    expect(thrownError).toMatchObject({
      reason: "proxy-password-unreadable",
      status: 500,
    });
    expect(deps.loggerError).toHaveBeenCalledWith(
      "Saved proxy password could not be materialized",
      {
        error: "ciphertext unreadable",
        userId: 11,
      },
    );
  });
});