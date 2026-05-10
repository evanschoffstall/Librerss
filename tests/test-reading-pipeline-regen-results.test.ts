import { describe, expect, test } from "bun:test";

import { formatExpectedReadingOutput } from "./regen-extraction-proof-support";

describe("reading pipeline expectation regeneration", () => {
  test("formats extracted HTML fragments with Prettier before writing fixtures", async () => {
    const formattedOutput = await formatExpectedReadingOutput(
      "/tmp/article-results-1.html",
      '<p><a href="https://example.com" rel="noopener noreferrer nofollow" target="_blank">x</a></p><p>y</p>',
    );

    expect(formattedOutput).toBe(
      `
<p>
  <a
    href="https://example.com"
    rel="noopener noreferrer nofollow"
    target="_blank"
    >x</a
  >
</p>
<p>y</p>
`.trimStart(),
    );
  });
});
