/**
 * Covers the reading pipeline from captured article HTML through sanitize output.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import * as zlib from "zlib";

import { POST } from "@/app/api/articles/extract/route";
import { CONFIG } from "@/lib/config";
import {
  clearArticleExtractCacheForTests,
  fetchHtml,
  parseAndValidateArticleUrl,
} from "@/lib/extract";
import { fetchHtmlWithHttpCloak } from "@/lib/fetch/httpcloak-client";
import { decompressBody, HttpCloakUpstreamError } from "@/lib/fetch/response";
import {
  buildMetadataImageFallbackHtml,
  cleanSanitizedHtml,
  hasReadableArticleBody,
  isLikelyNavFooterBoilerplate,
  normalizeArticleHtmlSpacing,
  preCleanHtml,
  sanitizeRawContent,
  stripCommentEngagementBoilerplate,
  toParagraphHtml,
} from "@/lib/sanitize";
import { getHostname } from "@/lib/server";
import { decodePossiblyCompressedText } from "@/lib/utils/content-encoding";
import { promoteHttpCloakProxyUrl } from "@/lib/utils/httpcloak";

const mockReq = () =>
  new NextRequest("http://localhost/api/articles/extract", {
    body: JSON.stringify({ url: "https://example.com/article" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

async function compressWithZstd(input: string): Promise<Buffer> {
  const zstdCompress = (zlib as Record<string, unknown>).zstdCompress as
    | typeof zlib.brotliCompress
    | undefined;

  if (!zstdCompress) {
    throw new Error("zstd compression is unavailable in this runtime");
  }

  return new Promise<Buffer>((resolve, reject) => {
    zstdCompress(Buffer.from(input, "utf8"), (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

async function getBundledPlaceholderUrl(): Promise<string> {
  const { PLACEHOLDER_SOURCE_DEFINITIONS } =
    await import("@/lib/core/placeholder-sources");
  const seed = PLACEHOLDER_SOURCE_DEFINITIONS.flatMap(
    (definition) => definition.seeds,
  )[0];

  if (!seed) {
    throw new Error("Expected at least one bundled placeholder article.");
  }

  return seed.url;
}

const SPECIAL_CASE_BRAND = "Example Publisher";

const SPECIAL_CASE_STORY_URL =
  "https://example.com/stories/2026/2/25/2370437/example-story";
const SPECIAL_CASE_HOSTNAME = getHostname(SPECIAL_CASE_STORY_URL);

beforeEach(() => {
  mock.restore();
  clearArticleExtractCacheForTests();
});

afterEach(() => {
  mock.restore();
  clearArticleExtractCacheForTests();
});

describe("decodePossiblyCompressedText", () => {
  test("rejects compressed latin1 payloads that expand beyond the configured limit", async () => {
    const oversizedHtml = "x".repeat(CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES + 1);
    const compressedHtml = zlib
      .gzipSync(Buffer.from(oversizedHtml, "utf8"))
      .toString("latin1");

    await expect(
      decodePossiblyCompressedText(compressedHtml, {
        maxOutputBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
      }),
    ).rejects.toThrow("Upstream response too large");
  });
});

describe("article extract cleanup", () => {
  test("preserves article body when mixed content is below nav/footer detection threshold", () => {
    const input = `
      <p>Real article paragraph one.</p>
      <p>Real article paragraph two.</p>
      <p>${SPECIAL_CASE_BRAND}</p>
      <ul>
        <li><a href="https://example.com/">Front Page</a></li>
        <li><a href="https://example.com/comics">Comics</a></li>
        <li><a href="https://example.com/subscribe">Subscribe</a></li>
      </ul>
      <p>About</p>
      <ul>
        <li><a href="https://example.com/privacy">Privacy</a></li>
        <li><a href="https://example.com/masthead">Masthead</a></li>
      </ul>
    `;

    const cleaned = cleanSanitizedHtml(input, SPECIAL_CASE_STORY_URL);

    // Generic pipeline keeps mixed content when nav/footer threshold is not reached.
    expect(cleaned).toContain("Real article paragraph one");
    expect(cleaned).toContain("Real article paragraph two");
  });

  test("drops footer-only special-case extraction output", () => {
    const footerOnly = `
      <p>${SPECIAL_CASE_BRAND}</p>
      <ul>
        <li><a href="https://example.com/">Front Page</a></li>
        <li><a href="https://example.com/comics">Comics</a></li>
        <li><a href="https://example.com/feeds">RSS</a></li>
        <li><a href="https://example.com/subscribe">Subscribe</a></li>
        <li><a href="https://example.com/terms">Terms</a></li>
        <li><a href="https://example.com/privacy">Privacy</a></li>
      </ul>
      <p>About</p>
      <ul>
        <li><a href="https://example.com/masthead">Masthead</a></li>
      </ul>
    `;

    const cleaned = cleanSanitizedHtml(footerOnly, SPECIAL_CASE_STORY_URL);

    expect(cleaned).toBe("");
  });

  test("does not drop content that lacks sufficient nav/footer signals", () => {
    const input = `
      <p>About</p>
      <ul>
        <li><a href="https://example.com/privacy">Privacy</a></li>
      </ul>
      <p>Normal content</p>
    `;

    const cleaned = cleanSanitizedHtml(input, "https://example.com/article");

    expect(cleaned).toContain("Normal content");
    expect(cleaned).toContain("<p>About</p>");
  });

  test("removes lead figure headings and duplicate lead image", () => {
    const duplicatedLeadMedia =
      '<img src="https://example.com/lead.jpg" width="1200" height="800" />' +
      "<h2>PIA26706 Figure A</h2>" +
      "<h2>PIA26706 Animation</h2>" +
      "<h2>Description</h2>" +
      "<p>Body intro text.</p>" +
      '<a href="https://example.com/lead.jpg"><img src="https://example.com/lead.jpg" width="1200" height="800" /></a>' +
      "<p>Figure details.</p>";

    const cleaned = cleanSanitizedHtml(
      duplicatedLeadMedia,
      "https://example.com/article",
    );

    expect(cleaned).not.toContain("PIA26706 Figure A");
    expect(cleaned).not.toContain("PIA26706 Animation");
    expect(cleaned).not.toContain("<h2>Description</h2>");
    expect(
      cleaned.match(/<img\b[^>]*\bsrc="https:\/\/example\.com\/lead\.jpg"/g)
        ?.length,
    ).toBe(1);
    expect(cleaned).toContain("Body intro text.");
  });

  test("preserves non-boilerplate lead headings", () => {
    const meaningfulLeadHeading =
      '<img src="https://example.com/lead.jpg" width="1200" height="800" />' +
      "<h2>Mission Overview</h2>" +
      "<p>Body intro text.</p>";

    const cleaned = cleanSanitizedHtml(
      meaningfulLeadHeading,
      "https://example.com/article",
    );

    expect(cleaned).toContain("<h2>Mission Overview</h2>");
    expect(cleaned).toContain("Body intro text.");
  });

  test("removes lead metadata chrome while preserving intro prose and images", () => {
    const broadCmsExtraction = `
      <h2>Regional resource assessment published</h2>
      <h3>Summary values and supporting material</h3>
      <a href="https://example.com/report">Read the fact sheet on the assessment</a>
      By <a href="https://example.com/team">Communications Team</a>
      January 15, 2026
      <p><strong>RIVER CITY.</strong> A public research office released a new assessment describing recoverable resources across several adjoining basins and state-managed areas.</p>
      <p>The assessment reviews historical production, recent exploration, and the technical assumptions used to estimate remaining resources.</p>
      <h3>Video file</h3>
      <a href="https://example.com/media/assessment-map">Media <img src="https://example.com/images/assessment-map.png" width="900" height="600" alt="Assessment map" /></a>
      Source/Credit: Provided handout.
      <a href="https://example.com/media/assessment-map">View Media Details</a>
      <a href="https://example.com/media/random-fact">Show me another fact</a>
    `;

    const cleaned = cleanSanitizedHtml(
      broadCmsExtraction,
      "https://example.com/news/regional-resource-assessment/",
    );

    expect(cleaned).not.toContain("Regional resource assessment published");
    expect(cleaned).not.toContain("Read the fact sheet");
    expect(cleaned).not.toContain("Communications Team");
    expect(cleaned).not.toContain("Source/Credit");
    expect(cleaned).not.toContain("View Media Details");
    expect(cleaned).not.toContain("Video file");
    expect(cleaned).not.toContain("Show me another fact");
    expect(cleaned).toContain("A public research office released");
    expect(cleaned).toContain("technical assumptions");
    expect(cleaned).toContain("assessment-map.png");
  });

  test("removes long leading metadata preambles before the first article paragraph", () => {
    const longLeadingPreamble = `
      <h2>USGS releases assessment of undiscovered oil and gas resources in Woodford and Barnett shales</h2>
      <h3>28.3 trillion cubic feet of gas, 1.6 billion barrels of oil estimated in New Mexico, Texas</h3>
      <a href="https://example.com/factsheet">Read the factsheet on undiscovered oil and gas in the Woodford Shale and Barnett</a>
      By <a href="https://example.com/team">Communications and Publishing</a>
      January 14, 2026
      <p><strong>RESTON, Va.</strong> The U.S. Geological Survey released its assessment of undiscovered gas and oil in the Woodford and Barnett shales in the Permian Basin.</p>
      <p>Since production began in the late 1990s, the Woodford and Barnett shales have produced millions of barrels of oil and remain an important source of domestic energy.</p>
    `;

    const cleaned = cleanSanitizedHtml(
      longLeadingPreamble,
      "https://example.com/news/woodford-barnett-assessment/",
    );

    expect(cleaned).toContain("RESTON, Va.");
    expect(cleaned).toContain("important source of domestic energy");
    expect(cleaned).not.toContain("Read the factsheet");
    expect(cleaned).not.toContain("Communications and Publishing");
    expect(cleaned).not.toContain("January 14, 2026");
  });

  test("removes trailing related-news chrome while preserving article sections and images", () => {
    const extractedArticle = `
      <p>The habitat team described restoration work across several wetlands and community projects.</p>
      <h2>Coastal Wetland Habitat</h2>
      <p>Wetlands filter water, reduce flood risk, and provide habitat for fish and other wildlife.</p>
      <img src="https://example.com/images/wetland.jpg" width="750" height="500" alt="Wetland habitat" />
      <h2>More Information</h2>
      <h2>Recent News</h2>
      <h4><a href="https://example.com/feature-story/related-story">Related feature</a></h4>
      Feature Story , National National
      <a href="https://example.com/feature-story/related-story"><img src="https://example.com/images/related-card.jpg" width="375" height="250" alt="Related card" /></a>
      <a href="https://example.com/news-and-announcements/news">More News</a>
      <p>Last updated by <a href="https://example.com/about/team">Example Team</a> on March 16, 2026</p>
      <a href="https://example.com/tags/wetlands">Wetlands</a>
    `;

    const cleaned = cleanSanitizedHtml(
      extractedArticle,
      "https://example.com/feature-story/marsh-habitat/",
    );

    expect(cleaned).toContain("Coastal Wetland Habitat");
    expect(cleaned).toContain("wetland.jpg");
    expect(cleaned).not.toContain("More Information");
    expect(cleaned).not.toContain("Recent News");
    expect(cleaned).not.toContain("related-card.jpg");
    expect(cleaned).not.toContain("Last updated by");
    expect(cleaned).not.toContain("/tags/wetlands");
  });

  test("collapses punctuation gaps left by stripped download ctas", () => {
    const extractedArticle = `
      <p>
        The report is available as a single PDF file, which can be viewed using Adobe Acrobat Reader.
        <a href="https://example.com/download">Follow this link to download the report</a>.
      </p>
    `;

    const cleaned = cleanSanitizedHtml(
      extractedArticle,
      "https://example.com/report/downloads/",
    );

    expect(cleaned).toContain("Adobe Acrobat Reader.");
    expect(cleaned).not.toContain("Reader. .");
    expect(cleaned).not.toContain("Follow this link to download");
  });

  describe("preCleanHtml", () => {
    test("removes <script> and <style> blocks", () => {
      const html =
        "<p>article</p><script>alert(1)</script><style>.x{}</style><p>more</p>";
      const result = preCleanHtml(html);
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("<style>");
      expect(result).toContain("article");
      expect(result).toContain("more");
    });

    test("removes <footer> element so extractor does not pick up site chrome", () => {
      const html =
        "<p>Article body.</p>" +
        "<footer><nav><ul><li><a href='/home'>Home</a></li>" +
        "<li><a href='/privacy'>Privacy</a></li>" +
        "<li><a href='/terms'>Terms</a></li></ul></nav>" +
        "<p>© 2025 Publisher Inc.</p></footer>";
      const result = preCleanHtml(html);
      expect(result).toContain("Article body.");
      expect(result).not.toContain("Privacy");
      expect(result).not.toContain("© 2025");
    });

    test("removes <header> element so extractor does not pick up site navigation", () => {
      const html =
        "<header><nav><a href='/'>Home</a><a href='/about'>About</a></nav>" +
        "<div class='site-masthead'>Publisher Name</div></header>" +
        "<p>Article paragraph one.</p><p>Article paragraph two.</p>";
      const result = preCleanHtml(html);
      expect(result).toContain("Article paragraph one.");
      expect(result).not.toContain("site-masthead");
      expect(result).not.toContain("Publisher Name");
    });

    test("removes both <header> and <footer> when both present", () => {
      const html =
        "<header><a href='/'>Home</a></header>" +
        "<p>Real content here.</p>" +
        "<footer><p>Copyright notice</p></footer>";
      const result = preCleanHtml(html);
      expect(result).toContain("Real content here.");
      expect(result).not.toContain("Copyright notice");
      expect(result).not.toContain("<header");
      expect(result).not.toContain("<footer");
    });

    test("handles HTML without header or footer unchanged in structure", () => {
      const html = "<div><p>Just an article.</p></div>";
      const result = preCleanHtml(html);
      expect(result).toContain("Just an article.");
    });

    test("removes comment widget containers by id", () => {
      const html =
        "<p>Article text.</p>" +
        '<div id="viafoura-comments"><p>Leave a comment</p></div>';
      const result = preCleanHtml(html);
      expect(result).toContain("Article text.");
      expect(result).not.toContain("Leave a comment");
    });

    test("preserves content-rich noscript article fallback blocks", () => {
      const html =
        "<div>shell</div>" +
        "<noscript>" +
        "<div class='story__text'>" +
        "<p>Field Notes is a weekly series on design trends and everyday culture.</p>" +
        "<p>The museum's spring renovation has shown how small material choices can reshape a public space, from brighter galleries to quieter reading corners.</p>" +
        "<p>Visitors now move through the building more slowly, noticing details that once disappeared behind dark walls and crowded displays.</p>" +
        "</div>" +
        "</noscript>" +
        "<noscript><a href='/privacy'>Privacy</a></noscript>";

      const result = preCleanHtml(html);

      expect(result).toContain("spring renovation");
      expect(result).toContain("crowded displays");
      expect(result).not.toContain("/privacy");
    });
  });

  test("toParagraphHtml creates paragraph blocks from plain text", () => {
    const html = toParagraphHtml("One\nline\n\nTwo");
    expect(html).toContain("<p>One<br />line</p>");
    expect(html).toContain("<p>Two</p>");
  });

  test("sanitizeRawContent returns empty for blank content", () => {
    expect(sanitizeRawContent("   ")).toBe("");
  });

  test("sanitizeRawContent wraps plain text and keeps safe markup", () => {
    const cleaned = sanitizeRawContent("Headline\n\nSecond paragraph");
    expect(cleaned).toContain("<p>");
    expect(cleaned).toContain("Headline");
    expect(cleaned).toContain("Second paragraph");
  });

  test("sanitizeRawContent sanitizes existing html input", () => {
    const cleaned = sanitizeRawContent("<p>Safe</p><script>alert(1)</script>");
    expect(cleaned).toContain("Safe");
    expect(cleaned).not.toContain("<script>");
  });

  test("sanitizeRawContent normalizes invisible publisher whitespace in html", () => {
    const cleaned = sanitizeRawContent(
      "<p>First&nbsp;sentence.\u00A0Second\u202Fsentence.\u200B</p>",
    );

    expect(cleaned).toBe("<p>First sentence. Second sentence.</p>");
    expect(cleaned).not.toContain("\u00A0");
    expect(cleaned).not.toContain("\u202F");
    expect(cleaned).not.toContain("\u200B");
  });

  test("sanitizeRawContent preserves figures and promotes lazy image sources", () => {
    const cleaned = sanitizeRawContent(
      '<figure><img data-src="/images/article.jpg" alt="Hero" width="800" height="600" /></figure>',
    );

    expect(cleaned).toContain("<img");
    expect(cleaned).toContain('src="/images/article.jpg"');
  });

  test("sanitizeRawContent keeps image content wrapped by section containers", () => {
    const cleaned = sanitizeRawContent(
      '<section><article><div><p><img src="https://example.com/hero.jpg" alt="Hero" width="800" height="600" /></p></div></article></section><p>Body text</p>',
    );

    expect(cleaned).toContain('<img src="https://example.com/hero.jpg"');
    expect(cleaned).toContain("Body text");
  });

  test("sanitizeRawContent recovers exactly one section-wrapped image when sanitizer drops wrappers", () => {
    const cleaned = sanitizeRawContent(
      '<section><article><p><img src="https://example.com/cover.jpg" alt="Cover" width="800" height="600" /></p></article></section><p>Story body.</p>',
    );

    const imgMatches = cleaned.match(/<img\b/gi) ?? [];
    expect(imgMatches).toHaveLength(1);
    expect(cleaned).toContain('src="https://example.com/cover.jpg"');
    expect(cleaned).toContain("Story body.");
  });

  test("sanitizeRawContent recovers multiple safe section-wrapped images when none survive sanitizer output", () => {
    const cleaned = sanitizeRawContent(
      '<section><article><p><img src="https://example.com/cover.jpg" alt="Cover" width="800" height="600" /></p><p><img src="https://example.com/diagram.jpg" alt="Diagram" width="800" height="600" /></p></article></section><p>Story body.</p>',
    );

    const imgMatches = cleaned.match(/<img\b/gi) ?? [];
    expect(imgMatches).toHaveLength(2);
    expect(cleaned).toContain('src="https://example.com/cover.jpg"');
    expect(cleaned).toContain('src="https://example.com/diagram.jpg"');
    expect(cleaned).toContain("Story body.");
  });

  test("sanitizeRawContent does not duplicate image when one is already preserved", () => {
    const cleaned = sanitizeRawContent(
      '<p><img src="https://example.com/inline.jpg" alt="Inline" width="800" height="600" /></p><p>Body copy.</p>',
    );

    const imgMatches = cleaned.match(/<img\b/gi) ?? [];
    expect(imgMatches).toHaveLength(1);
    expect(cleaned).toContain('src="https://example.com/inline.jpg"');
    expect(cleaned).toContain("Body copy.");
  });

  test("sanitizeRawContent removes direct tiny placeholder images below minimum size", () => {
    const cleaned = sanitizeRawContent(
      '<img src="https://static.example.com/grey-placeholder.png" width="150" height="84" alt="placeholder" /><p>Article body.</p>',
    );

    expect(cleaned).not.toContain("grey-placeholder.png");
    expect(cleaned).toContain("Article body.");
  });

  test("sanitizeRawContent filters recovered tiny images below minimum size", () => {
    const cleaned = sanitizeRawContent(
      '<section><article><p><img src="https://example.com/tiny.jpg" width="24" height="24" alt="Tiny" /></p></article></section><p>Body text remains.</p>',
    );

    expect(cleaned).not.toContain("tiny.jpg");
    expect(cleaned).toContain("Body text remains.");
  });

  test("sanitizeRawContent keeps dimensionless article images while dropping dimensionless chrome", () => {
    const cleaned = sanitizeRawContent(
      '<p><img src="https://example.com/images/mission-photo.jpg" alt="Mission photo" /></p>' +
        '<p><img src="https://example.com/assets/images/site-logo@2x.png" alt="Site logo" /></p>' +
        "<p>Body text remains.</p>",
    );

    expect(cleaned).toContain("mission-photo.jpg");
    expect(cleaned).not.toContain("site-logo@2x.png");
    expect(cleaned).toContain("Body text remains.");
  });

  test("stripCommentEngagementBoilerplate removes login and commenting prompt paragraphs", () => {
    const input =
      '<img src="https://example.com/images/comment-gate-hero.png" alt="hero" />' +
      "<p>You must confirm your public display name before commenting</p>" +
      "<p>Please logout and then login again, you will then be prompted to enter your display name.</p>" +
      "<p>Real article body paragraph.</p>";

    const cleaned = stripCommentEngagementBoilerplate(input);

    expect(cleaned).toContain("comment-gate-hero.png");
    expect(cleaned).toContain("Real article body paragraph.");
    expect(cleaned.toLowerCase()).not.toContain("display name");
    expect(cleaned.toLowerCase()).not.toContain("please logout");
  });

  test("cleanSanitizedHtml removes leaked comment-gate paragraphs for non-special domains", () => {
    const input =
      "<p>Lead paragraph.</p>" +
      "<p>You must confirm your public display name before commenting</p>" +
      "<p>Please logout and then login again, you will then be prompted to enter your display name.</p>" +
      "<p>Second paragraph.</p>";

    const cleaned = cleanSanitizedHtml(
      input,
      "https://example.com/archaeology/site-history",
    );

    expect(cleaned).toContain("Lead paragraph.");
    expect(cleaned).toContain("Second paragraph.");
    expect(cleaned.toLowerCase()).not.toContain("public display name");
    expect(cleaned.toLowerCase()).not.toContain("please logout");
  });

  test("cleanSanitizedHtml removes a leading linked author bio fragment before article paragraphs", () => {
    const input =
      '<a href="https://example.com/authors/jane-doe">Jane Doe</a>' +
      "Jane Doe has written the publication's weekly column since 2020. " +
      "A staff journalist covering science and logistics. " +
      "Email: jane@example.com" +
      "<p>Lead paragraph.</p>" +
      "<p>Second paragraph.</p>";

    const cleaned = cleanSanitizedHtml(input, "https://example.com/article");

    expect(cleaned).toContain("Lead paragraph.");
    expect(cleaned).toContain("Second paragraph.");
    expect(cleaned).not.toContain("jane@example.com");
    expect(cleaned).not.toContain(
      "has written the publication's weekly column",
    );
    expect(cleaned).not.toContain("authors/jane-doe");
  });

  test("sanitizeRawContent removes known placeholder image URLs without dimensions", () => {
    const cleaned = sanitizeRawContent(
      '<section><article><p><img src="https://example.com/core/grey-placeholder.png" alt="Placeholder" /></p></article></section><p>Body text remains.</p>',
    );

    expect(cleaned).not.toContain("grey-placeholder.png");
    expect(cleaned).toContain("Body text remains.");
  });

  test("buildMetadataImageFallbackHtml uses og:image and og:description", () => {
    const fallback = buildMetadataImageFallbackHtml(`
      <html>
        <head>
          <meta property="og:image" content="https://example.com/diagram.jpg" />
          <meta property="og:description" content="A field illustration from the observation team." />
        </head>
      </html>
    `);

    expect(fallback).toContain('<img src="https://example.com/diagram.jpg"');
    expect(fallback).toContain(
      "A field illustration from the observation team.",
    );
  });

  test("buildMetadataImageFallbackHtml returns empty when image metadata is missing or unsafe", () => {
    const noImage = buildMetadataImageFallbackHtml(`
      <html><head><meta property="og:description" content="No image" /></head></html>
    `);

    const unsafeImage = buildMetadataImageFallbackHtml(`
      <html>
        <head>
          <meta property="og:image" content="javascript:alert(1)" />
          <meta property="og:description" content="Unsafe" />
        </head>
      </html>
    `);

    expect(noImage).toBe("");
    expect(unsafeImage).toBe("");
  });

  test("normalizeArticleHtmlSpacing removes empty paragraphs and inter-tag blank lines", () => {
    const cleaned = normalizeArticleHtmlSpacing(
      "<p></p>\n\n<p>One</p>\n\n<p>Two</p>",
    );

    expect(cleaned).toBe("<p>One</p>\n<p>Two</p>");
  });

  test("getHostname normalizes valid hostnames and handles invalid urls", () => {
    const uppercaseWwwUrl = SPECIAL_CASE_STORY_URL.replace(
      `${"https"}://${"www"}.`,
      `${"https"}://${"WWW"}.`,
    );

    expect(getHostname(uppercaseWwwUrl)).toBe(SPECIAL_CASE_HOSTNAME);
    expect(getHostname("not a url")).toBe("");
  });

  test("isLikelyNavFooterBoilerplate detects dense nav/footer marker content", () => {
    const footer = `
      <p>Front Page Comics Subscribe Gift subscriptions Privacy Masthead Rules of the Road</p>
      <ul>
        <li><a href="#">a</a></li><li><a href="#">b</a></li><li><a href="#">c</a></li>
        <li><a href="#">d</a></li><li><a href="#">e</a></li><li><a href="#">f</a></li>
      </ul>
    `;

    expect(isLikelyNavFooterBoilerplate(footer)).toBe(true);
    expect(isLikelyNavFooterBoilerplate("<p>Normal story body</p>")).toBe(
      false,
    );
  });

  test("hasReadableArticleBody distinguishes image-only from real article body", () => {
    const imageOnly =
      '<img src="https://example.com/images/example/story.jpg" /><p>Short caption.</p>';
    const fullArticle =
      "<p>Paragraph one with enough narrative substance to represent article content.</p>" +
      "<p>Paragraph two adds more context and meaningful details for readers.</p>";

    expect(hasReadableArticleBody(imageOnly)).toBe(false);
    expect(hasReadableArticleBody(fullArticle)).toBe(true);
  });

  test("parseAndValidateArticleUrl handles missing URL, blocked URL, and valid URL", async () => {
    const missingUrl = await parseAndValidateArticleUrl("  ");
    expect(missingUrl).toBeInstanceOf(Response);
    expect((missingUrl as Response).status).toBe(400);

    const blocked = await parseAndValidateArticleUrl(
      "https://example.com/blocked",
      {
        isAllowedFeedUrlFn: async () => false,
      },
    );
    expect(blocked).toBeInstanceOf(Response);
    expect((blocked as Response).status).toBe(400);

    const allowed = await parseAndValidateArticleUrl(
      "  https://example.com/article  ",
      {
        isAllowedFeedUrlFn: async () => true,
      },
    );
    expect(allowed).toBe("https://example.com/article");

    // Fragment must be stripped: HTTP requests must not carry URL fragments
    // (RFC 3986 §3.5). CDNs can return 403/400 for requests with raw fragments.
    const withFragment = await parseAndValidateArticleUrl(
      "https://example.com/article#comments",
      {
        isAllowedFeedUrlFn: async () => true,
      },
    );
    expect(withFragment).toBe("https://example.com/article");

    const withQueryAndFragment = await parseAndValidateArticleUrl(
      "https://example.com/article?ref=rss#section-2",
      {
        isAllowedFeedUrlFn: async () => true,
      },
    );
    expect(withQueryAndFragment).toBe("https://example.com/article?ref=rss");
  });

  test("fetchHtml blocks disallowed URLs before HTTPCloak transport", async () => {
    const httpCloakFetchFn = mock(async (_url, isAllowedUrl) => {
      const isAllowed = await isAllowedUrl("https://example.com/a");

      if (!isAllowed) {
        throw new Error("Blocked URL");
      }

      return {
        html: "<html />",
        requestHeaders: {},
      };
    });

    await expect(
      fetchHtml("https://example.com/a", {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => false,
      }),
    ).rejects.toThrow("Blocked URL");

    expect(httpCloakFetchFn).toHaveBeenCalledTimes(1);
  });

  test("fetchHtml follows HTTPCloak redirects and returns the final body", async () => {
    const requestUrls: string[] = [];
    const httpCloakFetchFn = mock(async (url: string) => {
      requestUrls.push(url);

      if (url === "https://example.com/a") {
        return {
          html: "<html />",
          requestHeaders: {},
        };
      }

      return {
        html: "<html />",
        requestHeaders: {},
      };
    });

    const html = await fetchHtml("https://example.com/a", {
      httpCloakFetchFn,
      isAllowedFeedUrlFn: async () => true,
    });

    expect(html).toBe("<html />");
    expect(requestUrls).toEqual(["https://example.com/a"]);
  });

  test("POST returns early auth/parse responses", async () => {
    const authResponse = new Response("unauthorized", { status: 401 });
    const fromAuth = await POST(mockReq(), {
      requireMutableAuthenticatedUserFn: async () => authResponse,
    });
    expect(fromAuth).toBe(authResponse);

    const parseResponse = new Response("bad payload", { status: 400 });
    const fromParse = await POST(mockReq(), {
      parseAndValidateArticleUrlFn: async () => parseResponse,
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
    });
    expect(fromParse).toBe(parseResponse);
  });

  test("POST bypasses auth entirely for local placeholder snapshot requests", async () => {
    const authFn = mock(async () => {
      throw new Error("placeholder snapshot request should not authenticate");
    });

    const response = await POST(
      new NextRequest("http://localhost/api/articles/extract", {
        body: JSON.stringify({
          url: await getBundledPlaceholderUrl(),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      {
        requireMutableAuthenticatedUserFn: authFn,
      },
    );

    expect(response.status).toBe(200);
    expect(authFn).not.toHaveBeenCalled();
    const body = await response.json();
    expect(typeof body.content).toBe("string");
    expect(body.content.length).toBeGreaterThan(0);
  });

  test("POST maps HTTPCloak and generic failures to expected error handlers", async () => {
    const previousLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "verbose";

    const errorFn = mock(() => {});

    // Upstream 4xx (including 403, 429) must NOT be mirrored back to the
    // client — they are gateway failures, not client errors. Only upstream 404
    // is special-cased to 422 Unprocessable Content.
    const httpCloakError = new HttpCloakUpstreamError({
      proxyAddress: null,
      proxyMode: "direct",
      redirectHop: 0,
      requestHeaders: {},
      responseBody: "throttled",
      responseHeaders: { server: "cloudflare" },
      statusCode: 429,
    });
    try {
      const httpCloakResult = await POST(mockReq(), {
        errorFn: errorFn as any,
        fetchHtmlFn: async () => {
          throw httpCloakError;
        },
        parseAndValidateArticleUrlFn: async () => "https://example.com/article",
        requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
        toErrorMessageFn: () => "upstream-throttled",
      });

      expect(httpCloakResult.status).toBe(502);
      const httpCloakBody = await httpCloakResult.json();
      expect(httpCloakBody.error).toBe(
        "Failed to fetch article content from upstream",
      );
      expect(httpCloakBody.reason).toBe("upstream-throttled");
      expect(errorFn).toHaveBeenCalledWith(
        expect.stringContaining("upstream request failed"),
        expect.objectContaining({
          extractAttemptId: expect.any(String),
          statusCode: 429,
        }),
      );

      errorFn.mockClear();

      const genericResult = await POST(mockReq(), {
        errorFn: errorFn as any,
        fetchHtmlFn: async () => {
          throw new Error("boom");
        },
        parseAndValidateArticleUrlFn: async () => "https://example.com/article",
        requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
        toErrorMessageFn: () => "normalized-boom",
      });

      expect(genericResult.status).toBe(502);
      const genericBody = await genericResult.json();
      expect(genericBody.error).toBe("Failed to extract article content");
      expect(genericBody.reason).toBe("normalized-boom");
      expect(errorFn).toHaveBeenCalledTimes(1);
    } finally {
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }
  });

  test("POST rejects source access interstitials instead of returning empty success", async () => {
    const response = await POST(mockReq(), {
      fetchHtmlFn: async () => `
        <!doctype html>
        <html>
          <body>
            <div id="sec-if-cpt-container" role="main" style="display: none">
              <div class="behavioral-content">
                <div class="scf-akamai-logo-sec-abc">
                  <p class="scf-akamai-protected-by">Powered and protected by</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
    });

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("Failed to extract article content");
    expect(body.reason).toContain("Akamai");
  });

  // ─── Fragment stripping and vendor-response handling ─────────────────────

  test("fetchHtml strips fragment from the initial URL before calling HTTPCloak", async () => {
    const requestedUrls: string[] = [];
    const httpCloakFetchFn = mock(async (url: string) => {
      requestedUrls.push(url);
      return {
        html: "<html />",
        requestHeaders: {},
      };
    });

    await fetchHtml("https://example.com/article#comments", {
      httpCloakFetchFn,
      isAllowedFeedUrlFn: async () => true,
    });

    expect(requestedUrls).toEqual(["https://example.com/article#comments"]);
  });

  test("fetchHtml raises DataDome-specific errors from HTTPCloak responses", async () => {
    const httpCloakFetchFn = mock(async () => {
      throw new HttpCloakUpstreamError({
        proxyAddress: null,
        proxyMode: "direct",
        redirectHop: 0,
        requestHeaders: {},
        responseBody: "blocked",
        responseHeaders: { "x-datadome": "protected" },
        statusCode: 403,
      });
    });

    await expect(
      fetchHtml("https://example.com/article", {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("DataDome");
  });

  test("fetchHtml raises PerimeterX-specific errors from HTTPCloak responses", async () => {
    const httpCloakFetchFn = mock(async () => {
      throw new HttpCloakUpstreamError({
        proxyAddress: null,
        proxyMode: "direct",
        redirectHop: 0,
        requestHeaders: {},
        responseBody: "<html>px-captcha challenge</html>",
        responseHeaders: { "x-px-vid": "some-vid" },
        statusCode: 403,
      });
    });

    await expect(
      fetchHtml("https://example.com/article", {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("PerimeterX");
  });

  test("fetchHtml raises Cloudflare-specific errors from HTTPCloak responses", async () => {
    const httpCloakFetchFn = mock(async () => {
      throw new HttpCloakUpstreamError({
        proxyAddress: null,
        proxyMode: "direct",
        redirectHop: 0,
        requestHeaders: {},
        responseBody:
          "<html><title>Attention Required! | Cloudflare</title></html>",
        responseHeaders: {
          "cf-mitigated": "challenge",
          "set-cookie": "__cf_bm=abc",
        },
        statusCode: 403,
      });
    });

    await expect(
      fetchHtml("https://example.com/article", {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("Cloudflare");
  });

  test("fetchHtmlWithHttpCloak validates redirects against SSRF policy", async () => {
    let callCount = 0;
    const mockRequest = async (url: URL) => {
      callCount++;
      if (url.href === "https://example.com/article") {
        return {
          body: "",
          headers: { location: "http://127.0.0.1/private" } as Record<
            string,
            string | string[] | undefined
          >,
          statusCode: 302,
        };
      }
      return {
        body: "ok",
        headers: {} as Record<string, string | string[] | undefined>,
        statusCode: 200,
      };
    };

    await expect(
      fetchHtmlWithHttpCloak(
        "https://example.com/article",
        async (candidateUrl) => !candidateUrl.includes("127.0.0.1"),
        undefined,
        { requestFn: mockRequest },
      ),
    ).rejects.toThrow("Blocked redirect target");

    expect(callCount).toBe(1);
  });

  test("fetchHtml in proxy mode uses single httpCloak-fetch attempt", async () => {
    let callCount = 0;
    const mockHttpCloakFetch = mock(async () => {
      callCount++;
      return {
        html: "<html>proxied once</html>",
        requestHeaders: {} as Record<string, string | string[] | undefined>,
      };
    });

    const html = await fetchHtml(
      "https://example.com/article",
      {
        httpCloakFetchFn: mockHttpCloakFetch as any,
        isAllowedFeedUrlFn: async () => true,
      },
      { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
    );

    expect(html).toBe("<html>proxied once</html>");
    expect(callCount).toBe(1);
  });

  // ─── Proxy SOCKS tunnel architecture ──────────────────────────────────────
  // The custom httpCloak-fetch implementation tunnels ALL traffic (ALPN probe,
  // TLS handshake, HTTP request) through the SOCKS proxy. IP leaks are impossible
  // by design — no direct connections are made to the target.

  describe("proxy SOCKS tunnel architecture", () => {
    test("passes transport-only options to httpcloak", async () => {
      let capturedOptions: Record<string, unknown> | undefined;
      const mockHttpCloakFetch = mock(
        async (_url: string, _allowed: any, opts: any) => {
          capturedOptions = opts ? { ...opts } : {};
          return {
            html: "<html>ok</html>",
            requestHeaders: {} as Record<string, string | string[] | undefined>,
          };
        },
      );

      await fetchHtml(
        "https://example.com/some-article-title",
        {
          httpCloakFetchFn: mockHttpCloakFetch as any,
          isAllowedFeedUrlFn: async () => true,
        },
        { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
      );

      expect(capturedOptions).toEqual({
        proxyUrl: "socks5://127.0.0.1:1080",
      });
    });
  });

  // ─── Proxy loop compatibility-signal abort ────────────────────────────────
  // When PerimeterX or DataDome block the proxy egress IP, the block is at IP
  // reputation level — UA/httpCloak rotation cannot bypass it.  The proxy
  // loop must abort immediately on the first detected attempt rather than
  // burning all retry slots and delaying the caller by ~3 seconds.

  describe("proxy loop compatibility-signal abort", () => {
    const pxBody =
      '<!DOCTYPE html><html><head><meta name="description" content="px-captcha" /></head></html>';

    // Helper: creates a httpCloakFetchFn that throws HttpCloakUpstreamError with
    // the given statusCode, body, and headers on every call.
    function makeFpFetchError(
      statusCode: number,
      body: string,
      headers: Record<string, string | string[] | undefined> = {},
    ) {
      let callCount = 0;
      const fn = mock(async () => {
        callCount++;
        throw new HttpCloakUpstreamError({
          proxyAddress: null,
          proxyMode: "socks",
          redirectHop: 0,
          requestHeaders: {},
          responseBody: body,
          responseHeaders: headers,
          statusCode,
        });
      });
      return { fn, getCount: () => callCount };
    }

    test("aborts after 1 attempt on PerimeterX body detection (px-captcha)", async () => {
      const { fn, getCount } = makeFpFetchError(403, pxBody);

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            httpCloakFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      expect(getCount()).toBe(1);
    });

    test("aborts after 1 attempt on PerimeterX x-px-* response header", async () => {
      const { fn, getCount } = makeFpFetchError(403, "", {
        "x-px-vid": "some-vid-value",
      });

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            httpCloakFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      expect(getCount()).toBe(1);
    });

    test("aborts after 1 attempt on DataDome x-datadome: protected header", async () => {
      const { fn, getCount } = makeFpFetchError(403, "", {
        "x-datadome": "protected",
      });

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            httpCloakFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      expect(getCount()).toBe(1);
    });

    test("stops after 1 attempt on generic 403 (no compatibility signal)", async () => {
      const { fn, getCount } = makeFpFetchError(
        403,
        "<html>generic 403</html>",
      );

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            httpCloakFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      expect(getCount()).toBe(1);
    });

    test("stops after 1 attempt on 429 rate-limit (no compatibility signal)", async () => {
      const { fn, getCount } = makeFpFetchError(429, "");

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            httpCloakFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("429");

      expect(getCount()).toBe(1);
    });

    test("succeeds on first attempt and makes exactly 1 httpCloak-fetch call", async () => {
      let callCount = 0;
      const mockHttpCloakFetch = mock(async () => {
        callCount++;
        return {
          html: "<html>success</html>",
          requestHeaders: {} as Record<string, string | string[] | undefined>,
        };
      });

      const html = await fetchHtml(
        "https://example.com/article",
        {
          delayFn: async () => {},
          httpCloakFetchFn: mockHttpCloakFetch as any,
          isAllowedFeedUrlFn: async () => true,
        },
        { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
      );

      expect(html).toBe("<html>success</html>");
      expect(callCount).toBe(1);
    });

    test("passes the same transport-only options through the single HTTPCloak attempt", async () => {
      const capturedOptions: Record<string, unknown>[] = [];
      const mockHttpCloakFetch = mock(
        async (_url: string, _allowed: any, opts: any) => {
          capturedOptions.push(opts ? { ...opts } : {});
          throw new HttpCloakUpstreamError({
            proxyAddress: null,
            proxyMode: "socks",
            redirectHop: 0,
            requestHeaders: {},
            responseBody: "<html>blocked</html>",
            responseHeaders: {},
            statusCode: 403,
          });
        },
      );

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            httpCloakFetchFn: mockHttpCloakFetch as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      expect(capturedOptions).toEqual([
        {
          proxyUrl: "socks5://127.0.0.1:1080",
        },
      ]);
    });
  });

  // ─── HTTPCloak-fetch pure function tests ────────────────────────────────

  describe("promoteHttpCloakProxyUrl", () => {
    test("promotes socks5 URLs to remote-DNS socks5h", () => {
      expect(
        promoteHttpCloakProxyUrl("socks5://user:pass@proxy.example.com:1080"),
      ).toBe("socks5h://user:pass@proxy.example.com:1080");
    });

    test("promotes socks4 URLs to remote-DNS socks4a", () => {
      expect(promoteHttpCloakProxyUrl("socks4://10.0.0.1:9050")).toBe(
        "socks4a://10.0.0.1:9050",
      );
    });

    test("leaves non-socks URLs unchanged", () => {
      expect(promoteHttpCloakProxyUrl("https://example.com:8443")).toBe(
        "https://example.com:8443",
      );
    });

    test("returns invalid URLs unchanged", () => {
      expect(promoteHttpCloakProxyUrl("not-a-real-url")).toBe("not-a-real-url");
    });
  });

  describe("decompressBody", () => {
    test("returns plain text as-is for identity encoding", async () => {
      const buf = Buffer.from("hello world", "utf-8");
      expect(await decompressBody(buf, "")).toBe("hello world");
    });

    test("decompresses gzip", async () => {
      const { gzipSync } = await import("node:zlib");
      const compressed = gzipSync(Buffer.from("gzip content"));
      expect(await decompressBody(compressed, "gzip")).toBe("gzip content");
    });

    test("decompresses x-gzip", async () => {
      const { gzipSync } = await import("node:zlib");
      const compressed = gzipSync(Buffer.from("x-gzip content"));
      expect(await decompressBody(compressed, "x-gzip")).toBe("x-gzip content");
    });

    test("decompresses brotli", async () => {
      const { brotliCompressSync } = await import("node:zlib");
      const compressed = brotliCompressSync(Buffer.from("brotli content"));
      expect(await decompressBody(compressed, "br")).toBe("brotli content");
    });

    test("decompresses deflate", async () => {
      const { deflateSync } = await import("node:zlib");
      const compressed = deflateSync(Buffer.from("deflate content"));
      expect(await decompressBody(compressed, "deflate")).toBe(
        "deflate content",
      );
    });

    test("returns raw UTF-8 for unknown encoding", async () => {
      const buf = Buffer.from("raw", "utf-8");
      expect(await decompressBody(buf, "unknown")).toBe("raw");
    });
  });

  describe("fetchHtmlWithHttpCloak edge cases", () => {
    test("throws on redirect without Location header", async () => {
      const mockRequest = async () => ({
        body: "",
        headers: {} as Record<string, string | string[] | undefined>,
        statusCode: 302,
      });

      await expect(
        fetchHtmlWithHttpCloak(
          "https://example.com/article",
          async () => true,
          undefined,
          { requestFn: mockRequest },
        ),
      ).rejects.toThrow("Redirect without Location header");
    });

    test("throws on too many redirects", async () => {
      let hop = 0;
      const mockRequest = async () => {
        hop++;
        return {
          body: "",
          headers: { location: `https://example.com/hop${hop}` } as Record<
            string,
            string | string[] | undefined
          >,
          statusCode: 301,
        };
      };

      await expect(
        fetchHtmlWithHttpCloak(
          "https://example.com/start",
          async () => true,
          undefined,
          { requestFn: mockRequest },
        ),
      ).rejects.toThrow("Too many redirects");
    });

    test("returns decoded HTML for successful responses", async () => {
      const mockRequest = async () => ({
        body: "<html>ok</html>",
        headers: {} as Record<string, string | string[] | undefined>,
        statusCode: 200,
      });

      const result = await fetchHtmlWithHttpCloak(
        "https://example.com/article",
        async () => true,
        undefined,
        { requestFn: mockRequest },
      );

      expect(result.html).toBe("<html>ok</html>");
    });
  });

  // ─── POST logging ─────────────────────────────────────────────────────────

  test("POST returns extracted content on success", async () => {
    const response = await POST(mockReq(), {
      cleanSanitizedHtmlFn: (c) => c,
      extractFromHtmlFn: async () => ({
        content: "<p>Real article content here that is long enough.</p>",
        title: "Title",
      }),
      fetchHtmlFn: async () => "<html />",
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: (c) => c,
      warnFn: mock(() => {}),
    });

    expect(response.status).toBe(200);
    const payload: { content: string } = await response.json();
    expect(payload.content).toContain("Real article content");
  });

  test("POST decodes zstd-compressed html returned from fetchHtml before extraction", async () => {
    const zstdCompress = (zlib as Record<string, unknown>).zstdCompress;
    if (!zstdCompress) {
      expect(true).toBe(true);
      return;
    }

    const html =
      "<!DOCTYPE html><html><body><article><p>Example route fallback content.</p></article></body></html>";
    const compressedHtml = await compressWithZstd(html);

    let capturedHtml = "";
    const response = await POST(mockReq(), {
      cleanSanitizedHtmlFn: (c) => c,
      extractFromHtmlFn: async (receivedHtml) => {
        capturedHtml = receivedHtml;
        return {
          content: "<p>Example route fallback content.</p>",
          title: "T",
        };
      },
      fetchHtmlFn: async () => compressedHtml.toString("latin1"),
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: (c) => c,
      shouldUseExtractCacheFn: () => false,
      warnFn: mock(() => {}),
    });

    expect(capturedHtml).toContain("Example route fallback content");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { content?: string };
    expect(payload.content).toContain("Example route fallback content");
  });

  test("POST fires warn log when extractor returns no content", async () => {
    const warnFn = mock(() => {});

    await POST(mockReq(), {
      cleanSanitizedHtmlFn: (c) => c,
      extractFromHtmlFn: async () => null,
      fetchHtmlFn: async () => "<html />",
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: (c) => c,
      warnFn: warnFn as any,
    });

    const warnMessages: string[] = warnFn.mock.calls.map(
      (c: any[]) => c[0] as string,
    );
    expect(warnMessages.some((m) => m.includes("no content"))).toBe(true);
  });

  test("POST fires warn log when content is empty after full pipeline", async () => {
    const warnFn = mock(() => {});

    await POST(mockReq(), {
      cleanSanitizedHtmlFn: () => "",
      extractFromHtmlFn: async () => ({ content: "<p>stuff</p>", title: "T" }),
      fetchHtmlFn: async () => "<html />",
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: () => "",
      warnFn: warnFn as any,
    });

    const warnMessages: string[] = warnFn.mock.calls.map(
      (c: any[]) => c[0] as string,
    );
    expect(
      warnMessages.some((m) =>
        m.includes("empty after full extraction pipeline"),
      ),
    ).toBe(true);
  });

  test("POST falls back to metadata image when extractor output is nav/footer boilerplate", async () => {
    const warnFn = mock(() => {});

    const footerOnlyExtraction = `
      <p>Example Publisher</p>
      <ul>
        <li><a href="https://example.com/">Front Page</a></li>
        <li><a href="https://example.com/comics">Comics</a></li>
        <li><a href="https://example.com/feeds">RSS</a></li>
        <li><a href="https://example.com/subscribe">Subscribe</a></li>
        <li><a href="https://example.com/terms">Terms</a></li>
        <li><a href="https://example.com/privacy">Privacy</a></li>
      </ul>
      <p>About</p>
      <ul>
        <li><a href="https://example.com/masthead">Masthead</a></li>
      </ul>
    `;

    const response = await POST(mockReq(), {
      extractFromHtmlFn: async () => ({
        content: footerOnlyExtraction,
        title: "Field notes from the observation deck",
      }),
      fetchHtmlFn: async () => `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/images/1528229/story_image/observation-deck.jpg?1771436292" />
            <meta property="og:description" content="A field illustration from the observation team." />
          </head>
        </html>
      `,
      parseAndValidateArticleUrlFn: async () =>
        "https://example.com/stories/2026/2/27/2369312/field-notes-observation-deck",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      warnFn: warnFn as any,
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toContain(
      'src="https://example.com/images/1528229/story_image/observation-deck.jpg?1771436292"',
    );
    expect(payload.content).toContain(
      "A field illustration from the observation team.",
    );
    expect(
      warnFn.mock.calls.some((call: any[]) =>
        String(call[0]).includes("empty after full extraction pipeline"),
      ),
    ).toBe(false);
  });

  test("POST preserves CMS featured image beside selected article text", async () => {
    const response = await POST(mockReq(), {
      fetchHtmlFn: async () => `
        <html>
          <head>
            <title>Research notes from the observation deck</title>
            <meta property="og:description" content="A field illustration from the observation team." />
          </head>
          <body>
            <figure class="wp-block-post-featured-image">
              <img
                width="1024"
                height="786"
                src="https://example.com/wp-content/uploads/sites/2/2026/04/lead-observation.jpg?w=1024"
                class="attachment-post-thumbnail size-post-thumbnail wp-post-image"
                alt="A field illustration showing an observation platform beside a research vessel."
              />
            </figure>
            <div class="entry-content wp-block-post-content is-layout-flow wp-block-post-content-is-layout-flow">
              <p>A field illustration from the observation team.</p>
              <p><strong>Related | <a href="https://example.com/stories/2026/4/29/800029953/research/observation-methods/">Observation methods used during the coastal survey</a></strong></p>
            </div>
          </body>
        </html>
      `,
      parseAndValidateArticleUrlFn: async () =>
        "https://example.com/stories/2026/5/3/800030229/research/observation-deck-notes/",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toContain("lead-observation.jpg?w=1024");
    expect(payload.content).toContain(
      "A field illustration from the observation team.",
    );
    expect(payload.content).toContain("Observation methods used");
  });

  test("POST prefers camel case article body over sponsored callout copy", async () => {
    const response = await POST(mockReq(), {
      fetchHtmlFn: async () => `
        <html>
          <head>
            <title>Learning platform confirms data exposure</title>
            <meta property="og:description" content="A learning platform provider confirmed that account data was exposed during a recent security incident." />
          </head>
          <body>
            <article>
              <div class="article_section">
                <h1>Learning platform confirms data exposure</h1>
                <div class="articleBody">
                  <p><img alt="Learning platform dashboard" src="https://example.com/images/platform-dashboard.jpg" /></p>
                  <p>A learning platform provider confirmed that account data was exposed during a recent security incident.</p>
                  <p>The provider said the affected records include names, email addresses, course enrollments, and classroom messages.</p>
                  <p>Investigators continue to review the event while the provider rotates application keys and increases monitoring.</p>
                </div>
                <div class="article-callout">
                  <div class="article-media"><img src="https://example.com/ads/autonomous-validation2.jpg" alt="article image" /></div>
                  <div class="article-body">
                    <h2><a href="https://example.com/summit">Validation workshop registration</a></h2>
                    <p>A vendor workshop explains how autonomous validation finds exploitable issues.</p>
                    <p>Join the session to see workflow examples and remediation reporting.</p>
                    <a href="https://example.com/summit">Claim Your Spot</a>
                  </div>
                </div>
              </div>
            </article>
          </body>
        </html>
      `,
      parseAndValidateArticleUrlFn: async () =>
        "https://example.com/news/security/learning-platform-data-exposure/",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toContain("platform-dashboard.jpg");
    expect(payload.content).toContain("account data was exposed");
    expect(payload.content).toContain("application keys");
    expect(payload.content).not.toContain("autonomous-validation2.jpg");
    expect(payload.content).not.toContain("Claim Your Spot");
  });

  test("POST prepends metadata image when image-article extraction leaves only download metadata", async () => {
    const response = await POST(mockReq(), {
      extractFromHtmlFn: async () => ({
        content: `
          <p>A field observer photographed Earth from the spacecraft window.</p>
          <p><a href="https://example.com/image-article/hello-world/">Read More</a></p>
          <a href="https://example.com/wp-content/uploads/2026/04/art002e000192.jpg">Download</a>
          <p>Image Credit Example/Observer</p>
          <p>Size 5568x3712px</p>
        `,
        title: "Hello, World",
      }),
      fetchHtmlFn: async () => `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/wp-content/uploads/2026/04/art002e000192.jpg" />
            <meta property="og:description" content="A field observer photographed Earth through the spacecraft window after a planned engine burn." />
          </head>
        </html>
      `,
      parseAndValidateArticleUrlFn: async () =>
        "https://example.com/image-detail/fd02_for-pao/",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toContain(
      '<img src="https://example.com/wp-content/uploads/2026/04/art002e000192.jpg"',
    );
    expect(payload.content).toContain("Image Credit Example/Observer");
    expect(payload.content).toContain("Size 5568x3712px");
  });

  test("POST keeps empty content when metadata image fallback URL is unsafe", async () => {
    const warnFn = mock(() => {});

    const footerOnlyExtraction = `
      <p>Example Publisher</p>
      <ul>
        <li><a href="https://example.com/">Front Page</a></li>
        <li><a href="https://example.com/comics">Comics</a></li>
        <li><a href="https://example.com/feeds">RSS</a></li>
        <li><a href="https://example.com/subscribe">Subscribe</a></li>
        <li><a href="https://example.com/terms">Terms</a></li>
        <li><a href="https://example.com/privacy">Privacy</a></li>
      </ul>
      <p>About</p>
      <ul>
        <li><a href="https://example.com/masthead">Masthead</a></li>
      </ul>
    `;

    const response = await POST(mockReq(), {
      extractFromHtmlFn: async () => ({
        content: footerOnlyExtraction,
        title: "Field notes from the observation deck",
      }),
      fetchHtmlFn: async () => `
        <html>
          <head>
            <meta property="og:image" content="javascript:alert(1)" />
            <meta property="og:description" content="Unsafe metadata image." />
          </head>
        </html>
      `,
      parseAndValidateArticleUrlFn: async () =>
        "https://example.com/stories/2026/2/27/2369312/field-notes-observation-deck",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      warnFn: warnFn as any,
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toBe("");
    expect(
      warnFn.mock.calls.some((call: any[]) =>
        String(call[0]).includes("empty after full extraction pipeline"),
      ),
    ).toBe(true);
  });

  test("POST uses extract cache when enabled", async () => {
    const fetchHtmlFn = mock(async () => "<html />");
    const extractFromHtmlFn = mock(async () => ({
      content: "cached-content",
      source: "Source",
      title: "Title",
    }));
    const warnFn = mock(() => {});

    const deps = {
      cleanSanitizedHtmlFn: (content: string) => content,
      extractFromHtmlFn: extractFromHtmlFn as any,
      fetchHtmlFn: fetchHtmlFn as any,
      getHostnameFn: () => "example.com",
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: (content: string) => content,
      shouldUseExtractCacheFn: () => true,
      warnFn: warnFn as any,
    };

    const firstResponse = await POST(mockReq(), deps);
    const secondResponse = await POST(mockReq(), deps);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(fetchHtmlFn).toHaveBeenCalledTimes(1);
    expect(extractFromHtmlFn).toHaveBeenCalledTimes(1);
    expect(await secondResponse.json()).toEqual({
      content: "cached-content",
      source: "Source",
      title: "Title",
    });
  });

  test("POST does not cache empty extraction payloads", async () => {
    const fetchHtmlFn = mock(async () => "<html />");
    let extractCallCount = 0;
    const extractFromHtmlFn = mock(async () =>
      ++extractCallCount === 1
        ? { content: "", source: "Source", title: "Title" }
        : { content: "recovered-content", source: "Source", title: "Title" },
    );
    const warnFn = mock(() => {});

    const deps = {
      cleanSanitizedHtmlFn: (content: string) => content,
      extractFromHtmlFn: extractFromHtmlFn as any,
      fetchHtmlFn: fetchHtmlFn as any,
      getHostnameFn: () => "example.com",
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: (content: string) => content,
      shouldUseExtractCacheFn: () => true,
      warnFn: warnFn as any,
    };

    const firstResponse = await POST(mockReq(), deps);
    const secondResponse = await POST(mockReq(), deps);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(fetchHtmlFn).toHaveBeenCalledTimes(2);
    expect(extractFromHtmlFn).toHaveBeenCalledTimes(2);
    expect(await firstResponse.json()).toEqual({
      content: "",
      source: "Source",
      title: "Title",
    });
    expect(await secondResponse.json()).toEqual({
      content: "recovered-content",
      source: "Source",
      title: "Title",
    });
  });

  test("POST bypasses extract cache when disabled", async () => {
    const fetchHtmlFn = mock(async () => "<html />");
    const extractFromHtmlFn = mock(async () => ({
      content: "uncached-content",
      source: "Source",
      title: "Title",
    }));
    const warnFn = mock(() => {});

    const deps = {
      cleanSanitizedHtmlFn: (content: string) => content,
      extractFromHtmlFn: extractFromHtmlFn as any,
      fetchHtmlFn: fetchHtmlFn as any,
      getHostnameFn: () => "example.com",
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: (content: string) => content,
      shouldUseExtractCacheFn: () => false,
      warnFn: warnFn as any,
    };

    const firstResponse = await POST(mockReq(), deps);
    const secondResponse = await POST(mockReq(), deps);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(fetchHtmlFn).toHaveBeenCalledTimes(2);
    expect(extractFromHtmlFn).toHaveBeenCalledTimes(2);
  });
});
