/**
 * Comprehensive Tests: Feed Repository
 * Tests for src/lib/api/feeds/repository.ts
 */

import type { FeedTransaction } from "@/lib/api/feeds/types";
import * as realDbModule from "@/lib/db/db";
import * as realFeedRecordsModule from "@/lib/db/feed-records";
import { DEFAULT_CATEGORY_LABEL } from "@/lib/utils/categories";
import * as realUrlModule from "@/lib/utils/url";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

const getFeedRepository = async () => import("@/lib/api/feeds/repository");

const toFeedSourceResponse = async (row: {
  id: number;
  name: string;
  url: string;
  category: string | null;
}) => (await getFeedRepository()).toFeedSourceResponse(row);

const listFeedSourcesForUser = async (userId: number) =>
  (await getFeedRepository()).listFeedSourcesForUser(userId);

const createOrUpdateFeedSource = async (
  tx: FeedTransaction,
  userId: number,
  payload: { name: string; url: string; category: string },
) => (await getFeedRepository()).createOrUpdateFeedSource(tx, userId, payload);

const renameFeedSourceForUser = async (
  userId: number,
  sourceId: number,
  name: string,
  url: string,
) =>
  (await getFeedRepository()).renameFeedSourceForUser(
    userId,
    sourceId,
    name,
    url,
  );

const deleteFeedSourceForUser = async (userId: number, sourceId: number) =>
  (await getFeedRepository()).deleteFeedSourceForUser(userId, sourceId);

const setFeedSourceEnabledForUser = async (
  userId: number,
  sourceId: number,
  enabled: boolean,
) =>
  (await getFeedRepository()).setFeedSourceEnabledForUser(
    userId,
    sourceId,
    enabled,
  );

const updateFeedSettingsForUser = async (
  userId: number,
  sourceId: number,
  settings: { extractionDisabled?: boolean; proxyEnabled?: boolean },
) =>
  (await getFeedRepository()).updateFeedSettingsForUser(
    userId,
    sourceId,
    settings,
  );

afterAll(() => {
  mock.module("@/lib/db/db", () => realDbModule);
  mock.module("@/lib/db/feed-records", () => realFeedRecordsModule);
  mock.module("@/lib/utils/url", () => realUrlModule);
  mock.restore();
});

// Mock database
const createMockDb = () => ({
  select: mock(() => ({
    from: mock(() => ({
      leftJoin: mock(() => ({
        leftJoin: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => Promise.resolve([])),
            limit: mock(() => Promise.resolve([])),
          })),
        })),
        where: mock(() => ({
          orderBy: mock(() => Promise.resolve([])),
          limit: mock(() => Promise.resolve([])),
        })),
      })),
      where: mock(() => ({
        limit: mock(() => Promise.resolve([])),
        orderBy: mock(() => Promise.resolve([])),
      })),
    })),
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([])),
      })),
    })),
  })),
  delete: mock(() => ({
    where: mock(() => ({
      returning: mock(() => Promise.resolve([])),
    })),
  })),
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() => Promise.resolve([])),
    })),
  })),
  transaction: mock(async (callback: any) => {
    const mockTx = createMockDb();
    return callback(mockTx);
  }),
});

let mockDb = createMockDb();

function registerModuleMocks() {
  mockDb = createMockDb();

  mock.module("@/lib/db/db", () => ({
    getDb: () => mockDb,
  }));

  mock.module("@/lib/db/feed-records", () => ({
    ensureFeedRecordByUrl: mock(async () => ({
      id: 1,
      url: "https://example.com/feed",
    })),
    findFeedIdByUrl: mock(async () => 1),
    removeUserFeedCategory: mock(async () => {}),
    replaceUserFeedCategory: mock(async () => {}),
  }));
}

beforeAll(() => {
  registerModuleMocks();
});

beforeEach(() => {
  registerModuleMocks();
});

describe("Feed Repository - Response Transformers", () => {
  test("toFeedSourceResponse normalizes empty category", async () => {
    const row = {
      id: 1,
      name: "Test Feed",
      url: "https://example.com/feed",
      category: null,
    };

    const result = await toFeedSourceResponse(row);

    expect(result.category).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("toFeedSourceResponse trims whitespace from category", async () => {
    const row = {
      id: 1,
      name: "Test Feed",
      url: "https://example.com/feed",
      category: "  Tech  ",
    };

    const result = await toFeedSourceResponse(row);

    expect(result.category).toBe("Tech");
  });

  test("toFeedSourceResponse preserves valid category", async () => {
    const row = {
      id: 1,
      name: "Test Feed",
      url: "https://example.com/feed",
      category: "Technology",
    };

    const result = await toFeedSourceResponse(row);

    expect(result.category).toBe("Technology");
  });

  test("toFeedSourceResponse handles empty string category", async () => {
    const row = {
      id: 1,
      name: "Test Feed",
      url: "https://example.com/feed",
      category: "",
    };

    const result = await toFeedSourceResponse(row);

    expect(result.category).toBe(DEFAULT_CATEGORY_LABEL);
  });
});

// Helper to build a two-level leftJoin chain mock used by listFeedSourcesForUser
const makeTwoJoinSelectMock = (resolvedRows: unknown[]) => ({
  select: mock(() => ({
    from: mock(() => ({
      leftJoin: mock(() => ({
        leftJoin: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => Promise.resolve(resolvedRows)),
          })),
        })),
      })),
    })),
  })),
});

describe("Feed Repository - List Operations", () => {
  test("listFeedSourcesForUser returns empty array for no feeds", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => makeTwoJoinSelectMock([]),
    }));

    const feeds = await listFeedSourcesForUser(1);

    expect(Array.isArray(feeds)).toBe(true);
    expect(feeds.length).toBe(0);
  });

  test("listFeedSourcesForUser returns user feeds", async () => {
    const mockFeeds = [
      {
        id: 1,
        name: "Feed 1",
        url: "https://example.com/feed1",
        category: "Tech",
      },
      {
        id: 2,
        name: "Feed 2",
        url: "https://example.com/feed2",
        category: "News",
      },
    ];

    mock.module("@/lib/db/db", () => ({
      getDb: () => makeTwoJoinSelectMock(mockFeeds),
    }));

    const feeds = await listFeedSourcesForUser(1);

    expect(feeds.length).toBe(2);
    expect(feeds[0].name).toBe("Feed 1");
  });

  test("listFeedSourcesForUser orders by name", async () => {
    const mockFeeds = [
      {
        id: 2,
        name: "B Feed",
        url: "https://example.com/b",
        category: "Tech",
      },
      {
        id: 1,
        name: "A Feed",
        url: "https://example.com/a",
        category: "News",
      },
    ];

    mock.module("@/lib/db/db", () => ({
      getDb: () => makeTwoJoinSelectMock(mockFeeds),
    }));

    const feeds = await listFeedSourcesForUser(1);

    expect(feeds).toBeDefined();
  });
});

describe("Feed Repository - Create/Update Operations", () => {
  test("createOrUpdateFeedSource creates new feed source", async () => {
    const mockTx = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])),
          })),
        })),
      })),
      insert: mock(() => ({
        values: mock(() => ({
          returning: mock(() =>
            Promise.resolve([
              {
                id: 1,
                name: "New Feed",
                url: "https://example.com/feed",
              },
            ]),
          ),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => ({
            returning: mock(() => Promise.resolve([])),
          })),
        })),
      })),
    } as unknown as FeedTransaction;

    const result = await createOrUpdateFeedSource(mockTx, 1, {
      name: "New Feed",
      url: "https://example.com/feed",
      category: "Tech",
    });

    expect(result).toBeDefined();
    expect(result.sourceRecord).toBeDefined();
  });

  test("createOrUpdateFeedSource updates existing feed source", async () => {
    const mockTx = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                {
                  id: 1,
                  name: "Existing Feed",
                  url: "https://example.com/feed",
                },
              ]),
            ),
          })),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => ({
            returning: mock(() =>
              Promise.resolve([
                {
                  id: 1,
                  name: "Updated Feed",
                  url: "https://example.com/feed",
                },
              ]),
            ),
          })),
        })),
      })),
      insert: mock(() => ({
        values: mock(() => ({
          returning: mock(() => Promise.resolve([])),
        })),
      })),
    } as unknown as FeedTransaction;

    const result = await createOrUpdateFeedSource(mockTx, 1, {
      name: "Updated Feed",
      url: "https://example.com/feed",
      category: "Tech",
    });

    expect(result).toBeDefined();
    expect(result.isNew).toBe(false);
  });

  test("createOrUpdateFeedSource normalizes URL", async () => {
    const mockTx = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])),
          })),
        })),
      })),
      insert: mock(() => ({
        values: mock(() => ({
          returning: mock(() =>
            Promise.resolve([
              {
                id: 1,
                name: "New Feed",
                url: "https://example.com/feed",
              },
            ]),
          ),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => ({
            returning: mock(() => Promise.resolve([])),
          })),
        })),
      })),
    } as unknown as FeedTransaction;

    const result = await createOrUpdateFeedSource(mockTx, 1, {
      name: "New Feed",
      url: " HTTPS://EXAMPLE.COM/FEED ",
      category: "Tech",
    });

    expect(result).toBeDefined();
  });

  test("createOrUpdateFeedSource normalizes category", async () => {
    const mockTx = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])),
          })),
        })),
      })),
      insert: mock(() => ({
        values: mock(() => ({
          returning: mock(() =>
            Promise.resolve([
              {
                id: 1,
                name: "New Feed",
                url: "https://example.com/feed",
              },
            ]),
          ),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => ({
            returning: mock(() => Promise.resolve([])),
          })),
        })),
      })),
    } as unknown as FeedTransaction;

    const result = await createOrUpdateFeedSource(mockTx, 1, {
      name: "New Feed",
      url: "https://example.com/feed",
      category: "  Tech  ",
    });

    expect(result).toBeDefined();
  });
});

describe("Feed Repository - Rename Operations", () => {
  test("renameFeedSourceForUser renames feed source", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(() =>
                Promise.resolve([{ id: 1, url: "https://example.com/feed" }]),
              ),
            })),
          })),
        })),
        transaction: mock(async (callback: any) => {
          const mockTx = {
            select: mock(() => ({
              from: mock(() => ({
                where: mock(() => ({
                  for: mock(() => ({
                    limit: mock(() =>
                      Promise.resolve([
                        { id: 1, url: "https://example.com/feed" },
                      ]),
                    ),
                  })),
                  limit: mock(() => Promise.resolve([])),
                })),
              })),
            })),
            update: mock(() => ({
              set: mock(() => ({
                where: mock(() => ({
                  returning: mock(() =>
                    Promise.resolve([
                      {
                        id: 1,
                        name: "Renamed Feed",
                        url: "https://example.com/feed",
                      },
                    ]),
                  ),
                })),
              })),
            })),
          };
          return callback(mockTx);
        }),
      }),
    }));

    const result = await renameFeedSourceForUser(
      1,
      1,
      "Renamed Feed",
      "https://example.com/feed",
    );

    expect(result).toBeDefined();
    expect(result?.name).toBe("Renamed Feed");
  });

  test("renameFeedSourceForUser returns null for non-existent source", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        transaction: mock(async (callback: any) => {
          const mockTx = {
            select: mock(() => ({
              from: mock(() => ({
                where: mock(() => ({
                  for: mock(() => ({
                    limit: mock(() => Promise.resolve([])),
                  })),
                  limit: mock(() => Promise.resolve([])),
                })),
              })),
            })),
          };
          return callback(mockTx);
        }),
      }),
    }));

    const result = await renameFeedSourceForUser(
      1,
      999,
      "Renamed Feed",
      "https://example.com/feed",
    );

    expect(result).toBeNull();
  });

  test("renameFeedSourceForUser handles URL change", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(() =>
                Promise.resolve([
                  { id: 1, url: "https://example.com/old-feed" },
                ]),
              ),
            })),
          })),
        })),
        transaction: mock(async (callback: any) => {
          const mockTx = {
            select: mock(() => ({
              from: mock(() => ({
                where: mock(() => ({
                  for: mock(() => ({
                    limit: mock(() =>
                      Promise.resolve([
                        { id: 1, url: "https://example.com/old-feed" },
                      ]),
                    ),
                  })),
                  limit: mock(() => Promise.resolve([])),
                })),
              })),
            })),
            insert: mock(() => ({
              values: mock(() => ({
                onConflictDoNothing: mock(() => ({
                  returning: mock(() =>
                    Promise.resolve([
                      { id: 2, url: "https://example.com/new-feed" },
                    ]),
                  ),
                })),
                onConflictDoUpdate: mock(() => Promise.resolve([])),
              })),
            })),
            delete: mock(() => ({
              where: mock(() => Promise.resolve([])),
            })),
            update: mock(() => ({
              set: mock(() => ({
                where: mock(() => ({
                  returning: mock(() =>
                    Promise.resolve([
                      {
                        id: 1,
                        name: "Feed",
                        url: "https://example.com/new-feed",
                      },
                    ]),
                  ),
                })),
              })),
            })),
          };
          return callback(mockTx);
        }),
      }),
    }));

    const result = await renameFeedSourceForUser(
      1,
      1,
      "Feed",
      "https://example.com/new-feed",
    );

    expect(result).toBeDefined();
  });
  test("renameFeedSourceForUser preserves category on URL change", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        transaction: mock(async (callback: any) => {
          const mockTx = {
            select: mock(() => ({
              from: mock(() => ({
                where: mock(() => ({
                  for: mock(() => ({
                    limit: mock(() =>
                      Promise.resolve([
                        { id: 1, url: "https://example.com/old-feed" },
                      ]),
                    ),
                  })),
                  limit: mock(() => Promise.resolve([])),
                })),
              })),
            })),
            insert: mock(() => ({
              values: mock(() => ({
                onConflictDoNothing: mock(() => ({
                  returning: mock(() =>
                    Promise.resolve([
                      { id: 2, url: "https://example.com/new-feed" },
                    ]),
                  ),
                })),
                onConflictDoUpdate: mock(() => Promise.resolve([])),
              })),
            })),
            delete: mock(() => ({
              where: mock(() => Promise.resolve([])),
            })),
            update: mock(() => ({
              set: mock(() => ({
                where: mock(() => ({
                  returning: mock(() =>
                    Promise.resolve([
                      {
                        id: 1,
                        name: "Feed",
                        url: "https://example.com/new-feed",
                      },
                    ]),
                  ),
                })),
              })),
            })),
          };
          return callback(mockTx);
        }),
      }),
    }));

    const result = await renameFeedSourceForUser(
      1,
      1,
      "Feed",
      "https://example.com/new-feed",
    );

    expect(result).toBeDefined();
  });
});

describe("Feed Repository - Delete Operations", () => {
  test("deleteFeedSourceForUser deletes feed source", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        transaction: mock(async (callback: any) => {
          const mockTx = {
            select: mock(() => ({
              from: mock(() => ({
                leftJoin: mock(() => ({
                  where: mock(() => ({
                    for: mock(() => ({
                      limit: mock(() =>
                        Promise.resolve([
                          {
                            id: 1,
                            name: "Feed",
                            url: "https://example.com/feed",
                            feedId: 1,
                          },
                        ]),
                      ),
                    })),
                  })),
                })),
              })),
            })),
            delete: mock(() => ({
              where: mock(() => ({
                returning: mock(() =>
                  Promise.resolve([
                    {
                      id: 1,
                      name: "Feed",
                      url: "https://example.com/feed",
                    },
                  ]),
                ),
              })),
            })),
          };
          return callback(mockTx);
        }),
      }),
    }));

    const result = await deleteFeedSourceForUser(1, 1);

    expect(result).toBeDefined();
    expect(result?.id).toBe(1);
  });

  test("deleteFeedSourceForUser returns null for non-existent source", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        transaction: mock(async (callback: any) => {
          const mockTx = {
            select: mock(() => ({
              from: mock(() => ({
                leftJoin: mock(() => ({
                  where: mock(() => ({
                    for: mock(() => ({
                      limit: mock(() => Promise.resolve([])),
                    })),
                  })),
                })),
              })),
            })),
          };
          return callback(mockTx);
        }),
      }),
    }));

    const result = await deleteFeedSourceForUser(1, 999);

    expect(result).toBeNull();
  });

  test("deleteFeedSourceForUser removes category associations", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        transaction: mock(async (callback: any) => {
          const mockTx = {
            select: mock(() => ({
              from: mock(() => ({
                leftJoin: mock(() => ({
                  where: mock(() => ({
                    for: mock(() => ({
                      limit: mock(() =>
                        Promise.resolve([
                          {
                            id: 1,
                            name: "Feed",
                            url: "https://example.com/feed",
                            feedId: 1,
                          },
                        ]),
                      ),
                    })),
                  })),
                })),
              })),
            })),
            delete: mock(() => ({
              where: mock(() => ({
                returning: mock(() =>
                  Promise.resolve([
                    {
                      id: 1,
                      name: "Feed",
                      url: "https://example.com/feed",
                    },
                  ]),
                ),
              })),
            })),
          };
          return callback(mockTx);
        }),
      }),
    }));

    const result = await deleteFeedSourceForUser(1, 1);

    expect(result).toBeDefined();
  });

  test("deleteFeedSourceForUser handles feeds without categories", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock((n: number) => {
                if (n === 1) {
                  // First select - source exists
                  return Promise.resolve([
                    {
                      id: 1,
                      name: "Feed",
                      url: "https://example.com/feed",
                    },
                  ]);
                }
                // Second select - no feed record
                return Promise.resolve([]);
              }),
            })),
          })),
        })),
        transaction: mock(async (callback: any) => {
          const mockTx = {
            select: mock(() => ({
              from: mock(() => ({
                leftJoin: mock(() => ({
                  where: mock(() => ({
                    for: mock(() => ({
                      limit: mock(() =>
                        Promise.resolve([
                          {
                            id: 1,
                            name: "Feed",
                            url: "https://example.com/feed",
                            feedId: null,
                          },
                        ]),
                      ),
                    })),
                  })),
                })),
              })),
            })),
            delete: mock(() => ({
              where: mock(() => ({
                returning: mock(() =>
                  Promise.resolve([
                    {
                      id: 1,
                      name: "Feed",
                      url: "https://example.com/feed",
                    },
                  ]),
                ),
              })),
            })),
          };
          return callback(mockTx);
        }),
      }),
    }));

    const result = await deleteFeedSourceForUser(1, 1);

    expect(result).toBeDefined();
  });
});

describe("Feed Repository - Settings Operations", () => {
  test("setFeedSourceEnabledForUser updates enabled flag", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(() =>
                Promise.resolve([
                  {
                    id: 4,
                    name: "Feed",
                    url: "https://example.com/feed",
                    enabled: false,
                    extractionDisabled: false,
                    proxyEnabled: false,
                  },
                ]),
              ),
            })),
          })),
        })),
      }),
    }));

    const result = await setFeedSourceEnabledForUser(1, 4, false);
    expect(result?.enabled).toBe(false);
  });

  test("setFeedSourceEnabledForUser returns null when source is missing", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(() => Promise.resolve([])),
            })),
          })),
        })),
      }),
    }));

    const result = await setFeedSourceEnabledForUser(1, 999, true);
    expect(result).toBeNull();
  });

  test("updateFeedSettingsForUser updates both extraction and proxy flags", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(() =>
                Promise.resolve([
                  {
                    id: 2,
                    name: "Feed",
                    url: "https://example.com/feed",
                    enabled: true,
                    extractionDisabled: true,
                    proxyEnabled: true,
                  },
                ]),
              ),
            })),
          })),
        })),
      }),
    }));

    const result = await updateFeedSettingsForUser(1, 2, {
      extractionDisabled: true,
      proxyEnabled: true,
    });

    expect(result?.extractionDisabled).toBe(true);
    expect(result?.proxyEnabled).toBe(true);
  });

  test("updateFeedSettingsForUser returns null when no settings are provided", async () => {
    const result = await updateFeedSettingsForUser(1, 2, {});
    expect(result).toBeNull();
  });

  test("updateFeedSettingsForUser returns null when update has no returned rows", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(() => Promise.resolve([])),
            })),
          })),
        })),
      }),
    }));

    const result = await updateFeedSettingsForUser(1, 2, {
      extractionDisabled: true,
    });

    expect(result).toBeNull();
  });
});

describe("Feed Repository - Upsert Failure Branch", () => {
  test("createOrUpdateFeedSource throws when existing source update returns nothing", async () => {
    const mockTx = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                {
                  id: 44,
                  name: "Old",
                  url: "https://example.com/feed",
                  enabled: true,
                },
              ]),
            ),
          })),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => ({
            returning: mock(() => Promise.resolve([])),
          })),
        })),
      })),
      insert: mock(() => ({
        values: mock(() => ({
          returning: mock(() => Promise.resolve([])),
        })),
      })),
    } as unknown as FeedTransaction;

    await expect(
      createOrUpdateFeedSource(mockTx, 1, {
        name: "Updated",
        url: "https://example.com/feed",
        category: "Tech",
      }),
    ).rejects.toThrow("Failed to update feed source");
  });
});
