import { beforeAll, expect, test } from "bun:test";

let buildRefreshPlan: Function;

beforeAll(async () => {
  const mod = await import("@/lib/core/feed-batch-pipeline");
  buildRefreshPlan = mod.buildRefreshPlan;
  console.log(
    "GOT ARRAY:",
    Array.isArray(buildRefreshPlan(new Map(), ["x"], false, false)),
  );
});

test("buildRefreshPlan returns array", () => {
  const r = buildRefreshPlan(new Map(), ["x"], false, false);
  expect(Array.isArray(r)).toBe(true);
});
