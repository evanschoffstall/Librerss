import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let accountServiceImportVersion = 0;

async function loadAccountServiceModule() {
  accountServiceImportVersion += 1;
  return import(
    `@/lib/server/services/account-service?account-service-test=${accountServiceImportVersion}`
  );
}

afterEach(() => {
  mock.restore();
});

beforeEach(() => {
  mock.restore();
});

describe("server account service", () => {
  test("deleteAccount deletes the user and logs the deletion", async () => {
    const warn = mock(() => {});

    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        delete: () => ({
          where: () => ({
            returning: () => Promise.resolve([{ id: 5 }]),
          }),
        }),
      }),
    }));
    mock.module("@/lib/logger", () => ({ logger: { info: () => {}, warn } }));

    const { deleteAccount } = await loadAccountServiceModule();

    await expect(deleteAccount(5)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("deleteAccount throws when the user does not exist", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        delete: () => ({
          where: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      }),
    }));

    const { deleteAccount } = await loadAccountServiceModule();

    await expect(deleteAccount(99)).rejects.toMatchObject({
      message: "Account not found",
      status: 404,
    });
  });

  test("exportAccountData loads dependent rows when feed sources exist", async () => {
    const info = mock(() => {});
    const results = [
      [
        {
          allowInsecureTls: false,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          email: "reader@example.com",
          lastForceRefreshedAt: null,
          proxyPassword: "stored-proxy-token",
          proxyUrl: "http://proxy-user@example-proxy.test:8080",
          proxyUsername: null,
        },
      ],
      [
        {
          enabled: true,
          extractionDisabled: false,
          id: 11,
          name: "Example Feed",
          proxyEnabled: false,
          url: "https://example.com/feed.xml",
        },
      ],
      [
        {
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          expiresAt: new Date("2025-01-01T00:00:00.000Z"),
          id: 21,
        },
      ],
      [
        {
          orderedLabels: ["News"],
          updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        },
      ],
      [
        {
          articleId: 31,
          isRead: true,
          isStarred: false,
          updatedAt: new Date("2024-01-03T00:00:00.000Z"),
        },
      ],
      [{ category: "News", feedId: 11 }],
      [
        {
          articleId: 31,
          articleLink: "https://example.com/story",
          articleTitle: "Story",
          feedUrl: "https://example.com/feed.xml",
        },
      ],
    ];
    const limitCallIndexes = new Set([0, 3]);
    let selectCall = 0;

    const db = {
      select: () => {
        const callIndex = selectCall;
        const result = results[selectCall] ?? [];
        selectCall += 1;

        return {
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                where: () => Promise.resolve(result),
              }),
            }),
            where: () =>
              limitCallIndexes.has(callIndex)
                ? {
                    limit: () => Promise.resolve(result),
                  }
                : Promise.resolve(result),
          }),
        };
      },
    };

    mock.module("@/lib/logger", () => ({ logger: { info, warn: () => {} } }));

    const { exportAccountData } = await loadAccountServiceModule();
    const payload = await exportAccountData(7, {
      getDbFn: () => db,
    });

    expect(payload.categories).toEqual([{ category: "News", feedId: 11 }]);
    expect(payload.articleStatusContext).toEqual([
      {
        articleId: 31,
        articleLink: "https://example.com/story",
        articleTitle: "Story",
        feedUrl: "https://example.com/feed.xml",
      },
    ]);
    expect(payload.user.proxyUrl).toBe("http://example-proxy.test:8080");
    expect(payload.user.proxyUsername).toBe("proxy-user");
    expect(payload.user.hasProxyPassword).toBe(true);
    expect(info).toHaveBeenCalledTimes(1);
  });

  test("exportAccountData throws when the user record is missing", async () => {
    const results = [[], [], [], [], []];
    const limitCallIndexes = new Set([0, 3]);
    let selectCall = 0;

    const db = {
      select: () => {
        const callIndex = selectCall;
        const result = results[selectCall] ?? [];
        selectCall += 1;

        return {
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                where: () => Promise.resolve(result),
              }),
            }),
            where: () =>
              limitCallIndexes.has(callIndex)
                ? {
                    limit: () => Promise.resolve(result),
                  }
                : Promise.resolve(result),
          }),
        };
      },
    };

    const { exportAccountData } = await loadAccountServiceModule();

    await expect(
      exportAccountData(7, {
        getDbFn: () => db,
      }),
    ).rejects.toMatchObject({
      message: "Account not found",
      status: 404,
    });
  });

  test("exportAccountData reports legacy embedded proxy credentials even without a stored password", async () => {
    const legacyProxyUsername = "legacy-user";
    const legacyProxyPassword = "legacy-pass";
    const results = [
      [
        {
          allowInsecureTls: false,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          email: "reader@example.com",
          lastForceRefreshedAt: null,
          proxyPassword: null,
          proxyUrl: `http://${legacyProxyUsername}:${legacyProxyPassword}@example-proxy.test:8080`,
          proxyUsername: null,
        },
      ],
      [],
      [],
      [],
      [],
    ];
    const limitCallIndexes = new Set([0, 3]);
    let selectCall = 0;

    const db = {
      select: () => {
        const callIndex = selectCall;
        const result = results[selectCall] ?? [];
        selectCall += 1;

        return {
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                where: () => Promise.resolve(result),
              }),
            }),
            where: () =>
              limitCallIndexes.has(callIndex)
                ? {
                    limit: () => Promise.resolve(result),
                  }
                : Promise.resolve(result),
          }),
        };
      },
    };

    const { exportAccountData } = await loadAccountServiceModule();
    const payload = await exportAccountData(7, {
      getDbFn: () => db,
    });

    expect(payload.user.hasProxyPassword).toBe(true);
    expect(payload.user.proxyUrl).toBe("http://example-proxy.test:8080");
    expect(payload.user.proxyUsername).toBe("legacy-user");
  });
});
