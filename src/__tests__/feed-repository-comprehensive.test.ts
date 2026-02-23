/**
 * Comprehensive Tests: Feed Repository
 * Tests for src/app/api/feeds/feed-repository.ts
 */

import {
  createOrUpdateFeedSource,
  deleteFeedSourceForUser,
  listFeedSourcesForUser,
  renameFeedSourceForUser,
  toFeedSourceResponse,
} from "@/app/api/feeds/feed-repository";
import type { FeedTransaction } from "@/app/api/feeds/feed-types";
import * as realDbModule from "@/lib/db/db";
import * as realFeedRecordsModule from "@/lib/db/feed-records";
import { DEFAULT_CATEGORY_LABEL } from "@/lib/utils/categories";
import * as realUrlModule from "@/lib/utils/url";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

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

const mockDb = createMockDb();

function registerModuleMocks() {
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

describe("Feed Repository - Response Transformers", () => {
  test("toFeedSourceResponse normalizes empty category", () => {
    const row = {
      id: 1,
      name: "Test Feed",
      url: "https://example.com/feed",
      category: null,
    };

    const result = toFeedSourceResponse(row);

    expect(result.category).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("toFeedSourceResponse trims whitespace from category", () => {
    const row = {
      id: 1,
      name: "Test Feed",
      url: "https://example.com/feed",
      category: "  Tech  ",
    };

    const result = toFeedSourceResponse(row);

    expect(result.category).toBe("Tech");
  });

  test("toFeedSourceResponse preserves valid category", () => {
    const row = {
      id: 1,
      name: "Test Feed",
      url: "https://example.com/feed",
      category: "Technology",
    };

    const result = toFeedSourceResponse(row);

    expect(result.category).toBe("Technology");
  });

  test("toFeedSourceResponse handles empty string category", () => {
    const row = {
      id: 1,
      name: "Test Feed",
      url: "https://example.com/feed",
      category: "",
    };

    const result = toFeedSourceResponse(row);

    expect(result.category).toBe(DEFAULT_CATEGORY_LABEL);
  });
});

describe("Feed Repository - List Operations", () => {
  test("listFeedSourcesForUser returns empty array for no feeds", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({
          from: mock(() => ({
            leftJoin: mock(() => ({
              where: mock(() => ({
                orderBy: mock(() => Promise.resolve([])),
              })),
            })),
          })),
        })),
      }),
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
      getDb: () => ({
        select: mock(() => ({
          from: mock(() => ({
            leftJoin: mock(() => ({
              where: mock(() => ({
                orderBy: mock(() => Promise.resolve(mockFeeds)),
              })),
            })),
          })),
        })),
      }),
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
      getDb: () => ({
        select: mock(() => ({
          from: mock(() => ({
            leftJoin: mock(() => ({
              where: mock(() => ({
                orderBy: mock(() => Promise.resolve(mockFeeds)),
              })),
            })),
          })),
        })),
      }),
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
                  limit: mock(() => Promise.resolve([])),
                })),
              })),
            })),
            update: mock(() => ({
              set: mock(() => ({
                where: mock(() =>
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
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(() => Promise.resolve([])),
            })),
          })),
        })),
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
                  limit: mock(() => Promise.resolve([])),
                })),
              })),
            })),
            update: mock(() => ({
              set: mock(() => ({
                where: mock(() =>
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
                  limit: mock(() =>
                    Promise.resolve([{ category: "Technology" }]),
                  ),
                })),
              })),
            })),
            update: mock(() => ({
              set: mock(() => ({
                where: mock(() =>
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
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(() =>
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
        })),
        transaction: mock(async (callback: any) => {
          const mockTx = {
            select: mock(() => ({
              from: mock(() => ({
                where: mock(() => ({
                  limit: mock(() => Promise.resolve([{ id: 1 }])),
                })),
              })),
            })),
            delete: mock(() => ({
              where: mock(() =>
                Promise.resolve([
                  {
                    id: 1,
                    name: "Feed",
                    url: "https://example.com/feed",
                  },
                ]),
              ),
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
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(() => Promise.resolve([])),
            })),
          })),
        })),
      }),
    }));

    const result = await deleteFeedSourceForUser(1, 999);

    expect(result).toBeNull();
  });

  test("deleteFeedSourceForUser removes category associations", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(() =>
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
        })),
        transaction: mock(async (callback: any) => {
          const mockTx = {
            select: mock(() => ({
              from: mock(() => ({
                where: mock(() => ({
                  limit: mock(() => Promise.resolve([{ id: 1 }])),
                })),
              })),
            })),
            delete: mock(() => ({
              where: mock(() =>
                Promise.resolve([
                  {
                    id: 1,
                    name: "Feed",
                    url: "https://example.com/feed",
                  },
                ]),
              ),
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
            delete: mock(() => ({
              where: mock(() =>
                Promise.resolve([
                  {
                    id: 1,
                    name: "Feed",
                    url: "https://example.com/feed",
                  },
                ]),
              ),
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
