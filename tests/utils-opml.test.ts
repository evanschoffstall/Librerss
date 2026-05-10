import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { generateOpml, parseOpmlFeedImport } from "@/lib/utils/opml";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

// ── utils/opml – generateOpml ────────────────────────────────────────────────

describe("utils/opml – generateOpml", () => {
  test("generates valid OPML XML with multiple categories", () => {
    const categories = [
      {
        children: [
          {
            data: { url: "https://example.com/tech-a/rss" },
            label: "Example Tech A",
          },
          {
            data: { url: "https://example.com/tech-b/rss" },
            label: "Example Tech B",
          },
        ],
        label: "Tech",
      },
      {
        children: [
          {
            data: { url: "https://example.com/science/rss" },
            label: "Example Science",
          },
        ],
        label: "Science",
      },
    ];

    const opml = generateOpml(categories as any);
    expect(opml).toContain('<?xml version="1.0"');
    expect(opml).toContain('<opml version="2.0">');
    expect(opml).toContain("LibreRSS Subscriptions");
    expect(opml).toContain('text="Tech"');
    expect(opml).toContain("example.com/tech-a/rss");
    expect(opml).toContain('text="Science"');
    expect(opml).toContain("example.com/science/rss");
    expect(opml).toContain("</opml>");
  });

  test("skips categories with no feeds", () => {
    const categories = [
      { children: [], label: "Empty Category" },
      {
        children: [{ data: { url: "https://example.com/rss" }, label: "Feed" }],
        label: "Has Feeds",
      },
    ];
    const opml = generateOpml(categories as any);
    expect(opml).not.toContain("Empty Category");
    expect(opml).toContain("Has Feeds");
  });

  test("escapes XML special characters in names/URLs", () => {
    const categories = [
      {
        children: [
          {
            data: { url: "https://example.com/feed?a=1&b=2" },
            label: "<Best> Feed",
          },
        ],
        label: 'Tech & "Science"',
      },
    ];
    const opml = generateOpml(categories as any);
    expect(opml).toContain("Tech &amp;");
    expect(opml).toContain("&quot;Science&quot;");
    expect(opml).toContain("&lt;Best&gt;");
    expect(opml).toContain("a=1&amp;b=2");
  });

  test("returns valid OPML structure for empty categories", () => {
    const opml = generateOpml([]);
    expect(opml).toContain("<body>");
    expect(opml).toContain("</body>");
    expect(opml).toContain("</opml>");
  });
});

// ─── OPML parsing ─────────────────────────────────────────────────────────────

describe("opml – parseOpmlFeedImport", () => {
  test("parses simple OPML with feeds", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech" title="Tech">
      <outline text="Example Tech A" xmlUrl="https://example.com/tech-a/rss" />
      <outline text="Example Tech B" xmlUrl="https://example.com/tech-b/feed/" />
    </outline>
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("Tech");
    expect(result[0].name).toBe("Example Tech A");
    expect(result[0].url).toContain("example.com/tech-a");
  });

  test("assigns default category for root-level feeds", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Direct Feed" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("My Feeds");
  });

  test("deduplicates feeds by URL", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Feed A" xmlUrl="https://example.com/feed" />
    <outline text="Feed B" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(1);
  });

  test("throws for invalid XML", async () => {
    expect(() => parseOpmlFeedImport("<invalid")).toThrow();
  });

  test("throws for OPML without body", async () => {
    const opml = '<?xml version="1.0"?><opml><head></head></opml>';
    expect(() => parseOpmlFeedImport(opml)).toThrow("OPML body is missing");
  });

  test("handles nested category groups", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Top Category">
      <outline text="Sub Category">
        <outline text="Deep Feed" xmlUrl="https://deep.example.com/feed" />
      </outline>
    </outline>
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("Sub Category");
  });

  test("uses feed title when text attribute is missing", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline title="Title Feed" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result[0].name).toBe("Title Feed");
  });

  test("falls back to Imported Feed when no name", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result[0].name).toBeTruthy();
  });

  test("skips feeds with non-HTTP protocol", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="FTP Feed" xmlUrl="ftp://example.com/feed" />
    <outline text="HTTP Feed" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(1);
    expect(result[0].url).toContain(`${"https"}://`);
  });

  test("skips feeds with invalid URLs", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Broken Feed" xmlUrl="not a url" />
    <outline text="Working Feed" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;

    const result = parseOpmlFeedImport(opml);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Working Feed");
  });

  test("normalizes feed URLs (strips trailing slashes)", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Feed" xmlUrl="https://example.com/feed/" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result[0].url).toBe("https://example.com/feed");
  });

  test("handles empty body", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body></body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(0);
  });

  test("respects import cap", async () => {
    const { CONFIG } = await import("@/lib/config");
    let feeds = "";
    for (let i = 0; i < CONFIG.OPML_MAX_IMPORT_ENTRIES + 50; i++) {
      feeds += `<outline text="Feed ${i}" xmlUrl="https://example.com/feed-${i}" />`;
    }
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><body>${feeds}</body></opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result.length).toBeLessThanOrEqual(CONFIG.OPML_MAX_IMPORT_ENTRIES);
  });
});
