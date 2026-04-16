import { describe, expect, test } from "bun:test";

import {
  clientFeedBatchConcurrency,
  clientFeedBatchMaxUrls,
  clientFeedRequestTimeoutMs,
  envBooleanOptional,
  envStringOptional,
  isDevelopment,
} from "@/lib/config";

const mutableEnv = process.env as Record<string, string | undefined>;

function withEnv(
  env: Record<string, string | undefined>,
  callback: () => void,
) {
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, mutableEnv[key]]),
  );

  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete mutableEnv[key];
      } else {
        mutableEnv[key] = value;
      }
    }

    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete mutableEnv[key];
      } else {
        mutableEnv[key] = value;
      }
    }
  }
}

describe("config optional env helpers", () => {
  test("envStringOptional trims strings and treats blank strings as missing", () => {
    withEnv(
      {
        COVERAGE_OPTIONAL_BLANK: "   ",
        COVERAGE_OPTIONAL_TEXT: "  hello world  ",
      },
      () => {
        expect(envStringOptional("COVERAGE_OPTIONAL_TEXT")).toBe("hello world");
        expect(envStringOptional("COVERAGE_OPTIONAL_BLANK")).toBeUndefined();
        expect(envStringOptional("COVERAGE_OPTIONAL_MISSING")).toBeUndefined();
      },
    );
  });

  test("envBooleanOptional falls back on blank strings and parses off values", () => {
    withEnv(
      {
        COVERAGE_OPTIONAL_BOOL_BLANK: "   ",
        COVERAGE_OPTIONAL_BOOL_OFF: "off",
      },
      () => {
        expect(envBooleanOptional("COVERAGE_OPTIONAL_BOOL_BLANK", true)).toBe(
          true,
        );
        expect(envBooleanOptional("COVERAGE_OPTIONAL_BOOL_OFF", true)).toBe(
          false,
        );
      },
    );
  });

  test("build-time config defaults back the numeric client accessors", () => {
    withEnv(
      {
        FEED_BATCH_CONCURRENCY: undefined,
        FEED_BATCH_MAX_URLS: undefined,
        FEED_REQUEST_TIMEOUT_MS: undefined,
        LIBRERSS_BUILD_CONFIG: JSON.stringify({
          FEED_BATCH_CONCURRENCY: "4",
          FEED_BATCH_MAX_URLS: "12",
          FEED_REQUEST_TIMEOUT_MS: "4500",
        }),
      },
      () => {
        expect(clientFeedBatchConcurrency()).toBe(4);
        expect(clientFeedBatchMaxUrls()).toBe(12);
        expect(clientFeedRequestTimeoutMs()).toBe(4500);
      },
    );
  });

  test("invalid build-time config JSON falls back to an empty config object", () => {
    withEnv(
      {
        COVERAGE_OPTIONAL_TEXT: undefined,
        FEED_BATCH_CONCURRENCY: undefined,
        LIBRERSS_BUILD_CONFIG: "{not-json",
      },
      () => {
        expect(envStringOptional("COVERAGE_OPTIONAL_TEXT")).toBeUndefined();
        expect(() => clientFeedBatchConcurrency()).toThrow(
          "Missing required environment variable: FEED_BATCH_CONCURRENCY",
        );
      },
    );
  });

  test("isDevelopment tracks NODE_ENV changes at call time", () => {
    const previousNodeEnv = mutableEnv.NODE_ENV;

    try {
      mutableEnv.NODE_ENV = "development";
      expect(isDevelopment()).toBe(true);

      mutableEnv.NODE_ENV = "test";
      expect(isDevelopment()).toBe(false);
    } finally {
      if (previousNodeEnv === undefined) {
        delete mutableEnv.NODE_ENV;
      } else {
        mutableEnv.NODE_ENV = previousNodeEnv;
      }
    }
  });
});
