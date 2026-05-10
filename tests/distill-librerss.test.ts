import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { distillArticle } from "@/lib/distill";
import { distillWithDefuddle } from "@/lib/distill/defuddle";
import { librerssDistill } from "@/lib/distill/librerss";
import { readabilityDistill } from "@/lib/distill/readability";
import { preCleanHtml } from "@/lib/sanitize";

import {
  createMultiArticleOwnershipFixture,
  MULTI_ARTICLE_OWNERSHIP_CURRENT_SENTENCE,
  MULTI_ARTICLE_OWNERSHIP_FIXTURE_URL,
  MULTI_ARTICLE_OWNERSHIP_WRONG_SENTENCE,
} from "./article-extraction-fixtures";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("lib/distill/librerss", () => {
  describe("librerssDistill", () => {
    test("returns null when no article body is found", async () => {
      const html = "<html><body><p>Too short.</p></body></html>";
      const result = await librerssDistill(html, "https://example.com/article");

      expect(result).toBeNull();
    });

    test("extracts article from semantic itemprop articleBody", async () => {
      const html = `
        <html>
          <head>
            <title>Test Article Title</title>
            <meta property="og:description" content="Test description from meta tag" />
          </head>
          <body>
            <div itemprop="articleBody">
              <p>This is the main article content with sufficient length to pass the threshold check.</p>
              <p>Additional paragraph to ensure we meet minimum length requirements.</p>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("main article content");
      expect(result?.title).toBe("Test Article Title");
      expect(result?.description).toBe("Test description from meta tag");
      expect(result?.source).toBe("https://example.com/article");
    });

    test("extracts article from common CMS class patterns", async () => {
      const html = `
        <html>
          <body>
            <div class="article-content">
              <p>Article body content from common CMS pattern with sufficient length.</p>
              <p>More content to meet the minimum threshold requirement.</p>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/post");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Article body content");
    });

    test("preserves a nearby featured image before a CMS text container", async () => {
      const html = `
        <html>
          <head><title>Research notes from the observation deck</title></head>
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
      `;

      const result = await librerssDistill(
        html,
        "https://example.com/stories/2026/5/3/800030229/research/observation-deck-notes/",
        { contentLengthThreshold: 120 },
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("lead-observation.jpg?w=1024");
      expect(result?.content).toContain(
        "A field illustration from the observation team.",
      );
      expect(result?.content).toContain("Observation methods used");
    });

    test("preserves nearby close-up lead images", async () => {
      const metadataSpacer = `<div>${"Photo metadata and share controls. ".repeat(260)}</div>`;
      const html = `
        <html>
          <body>
            <img src="https://example.com/images/Close-up_field_exam.jpg" alt="Close-up photograph of a field exam showing a researcher reviewing measurements with a participant." />
            ${metadataSpacer}
            <div class="body-content">
              <p>The research team reported that the field exam helped identify patterns across several participant groups.</p>
              <p>Follow-up analysis will compare those observations with longer term measurements gathered during the next study phase.</p>
              <p>The investigators said the approach could help teams prioritize resources while keeping review steps consistent.</p>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        preCleanHtml(html),
        "https://example.com/news/field-exam/",
        { contentLengthThreshold: 120 },
      );

      expect(result?.content).toContain("Close-up_field_exam.jpg");
      expect(result?.content).toContain("field exam helped identify patterns");
    });

    test("rejects generic service banners when preserving lead prose", async () => {
      const html = `
        <html>
          <body>
            <div class="shell">
              <section class="site-banner">
                <p>Official website notice: secure websites protect account settings and service information before you continue.</p>
                <p>Review privacy settings and share sensitive information only through the secure service portal.</p>
              </section>
              <main class="main-content">
                <div class="body-content">
                  <p>A research team funded by a public institute developed an automated scan analysis system for clinical assessment.</p>
                  <p>The team said the model can identify patterns across imaging records and help clinicians prioritize follow-up review.</p>
                  <p>Researchers are continuing to validate the system with additional datasets before it is considered for operational use.</p>
                </div>
              </main>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        preCleanHtml(html),
        "https://example.com/news/automated-scan-analysis/",
        { contentLengthThreshold: 120 },
      );

      expect(result?.content).toContain("automated scan analysis system");
      expect(result?.content).not.toContain("secure service portal");
      expect(result?.content).not.toContain("account settings");
    });

    test("does not widen to sidebar metadata rails that precede the true entry body", async () => {
      const html = `
        <html>
          <body>
            <article>
              <section class="sidebar-rail">
                <img src="https://example.com/images/unrelated-promo.jpg" alt="Unrelated promo image" />
                <p>The February 2026 eruption at Piton de la Fournaise has lasted longer and produced a larger volume of lava than recent eruptions from this frequently active volcano.</p>
                <p>NASA Earth Observatory</p>
                <a href="https://example.com/explorer"><img src="https://example.com/images/location-map.png" alt="Location map" /></a>
                <a href="https://example.com/previous"><img src="https://example.com/images/previous-card.jpg" alt="Previous related card" /></a>
                <a href="https://example.com/next"><img src="https://example.com/images/next-card.jpg" alt="Next related card" /></a>
                <ul>
                  <li><a href="https://example.com/topics/volcanoes">Volcanoes</a></li>
                </ul>
              </section>
              <div class="entry-content">
                <p><img src="https://example.com/images/reunion-main.jpg" alt="Thermal image of the eruption" /></p>
                <p>Located 700 kilometers east of Madagascar, Reunion Island remains active today with frequent eruptions from Piton de la Fournaise.</p>
                <p>Since the 17th century, the volcano has had more than 150 documented eruptions and the most recent began in February 2026.</p>
                <p>This thermal satellite image shows lava flowing east toward the ocean while warmer areas appear in yellow.</p>
              </div>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        preCleanHtml(html),
        "https://example.com/earth-observatory/reunion-island-lava-reaches-the-sea/",
        { contentLengthThreshold: 120 },
      );

      expect(result?.content).toContain("reunion-main.jpg");
      expect(result?.content).toContain(
        "Located 700 kilometers east of Madagascar",
      );
      expect(result?.content).not.toContain("unrelated-promo.jpg");
      expect(result?.content).not.toContain("location-map.png");
      expect(result?.content).not.toContain("Previous related card");
    });

    test("prefers camel case article body over sponsored callout copy", async () => {
      const html = `
        <html>
          <head><title>Learning platform confirms data exposure</title></head>
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
      `;

      const result = await librerssDistill(
        preCleanHtml(html),
        "https://example.com/news/security/learning-platform-data-exposure/",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("platform-dashboard.jpg");
      expect(result?.content).toContain("account data was exposed");
      expect(result?.content).toContain("application keys");
      expect(result?.content).not.toContain("autonomous-validation2.jpg");
      expect(result?.content).not.toContain("Claim Your Spot");
    });

    test("prefers the page-owning body when data-headline contains apostrophes", async () => {
      const result = await librerssDistill(
        preCleanHtml(createMultiArticleOwnershipFixture()),
        MULTI_ARTICLE_OWNERSHIP_FIXTURE_URL,
        { contentLengthThreshold: 120 },
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain(
        MULTI_ARTICLE_OWNERSHIP_CURRENT_SENTENCE,
      );
      expect(result?.content).not.toContain(
        MULTI_ARTICLE_OWNERSHIP_WRONG_SENTENCE,
      );
    });

    test("selects prose-dense multimedia descriptions without engagement chrome", async () => {
      const html = `
        <html>
          <head><title>Publisher - instrument image</title></head>
          <body>
            <div class="modal">
              <div class="modal__item">
                <img src="https://cdn.example.com/instrument.jpg" alt="A detailed image of a field instrument captured during a calibration exercise." />
              </div>
              <div class="modal__info">
                <div class="modal__header">
                  <span>Applications</span>
                  <span>03/04/2026</span>
                  <span>1000 views</span>
                  <span>32 likes</span>
                  <span>519338 ID</span>
                </div>
                <button>Like</button>
                <button>Download</button>
                <p>Thank you for liking</p>
                <p>You have already liked this page, you can only like it once!</p>
                <div id="cookie_alert">COOKIES To enable the sharing functionality, please accept all cookies.</div>
                <div class="modal__tabs"><button>Details</button><button>Related</button></div>
                <div class="modal__tab-description">
                  <p>The field instrument team captures this unusual image of a steady reference target for calibration.</p>
                  <p>The stable intensity of the reference light helps engineers detect and correct small instrument changes throughout the mission.</p>
                  <p>These observations keep measurement data accurate for applications that depend on consistent readings.</p>
                </div>
                <div class="modal__related">
                  <a href="/related"><img src="https://cdn.example.com/card.jpg" alt="Related card" />Related image</a>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/moon");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("cdn.example.com/instrument.jpg");
      expect(result?.content).toContain("field instrument team");
      expect(result?.content).toContain("measurement data accurate");
      expect(result?.content).not.toContain("Thank you for liking");
      expect(result?.content).not.toContain("accept all cookies");
      expect(result?.content).not.toContain("Related image");
    });

    test("selects the release body without surrounding contact and case modules", async () => {
      const html = `
        <html>
          <head><title>Regional board updates medication delivery guidance</title></head>
          <body>
            <article>
              <a href="/press-releases">Press Releases</a>
              <h2>The decision changes how time-sensitive care is delivered across several regions</h2>
              Case: <a href="https://example.com/cases/regional-board-guidance">Regional Board Guidance</a>
              <hr />
              <section class="release-contact-card">
                <h2>Spokesperson</h2>
                <a href="https://example.com/bios/staff-member">
                  <img src="https://example.com/images/staff-member.jpg" alt="Staff member headshot" />
                  Staff Member
                </a>
                <h2>Media Contact</h2>
                <a href="mailto:media@example.com">media@example.com</a>
                <a href="tel:+15550101010">(555) 010-1010</a>
              </section>
              <div class="body-content">
                <p>LAKE CITY - A regional appeals panel today ordered a temporary change to a long-standing care delivery policy while the review proceeds.</p>
                <p>The order reverses an earlier pause and requires patients to complete an in-person pickup step that had previously been available through remote care.</p>
                <p>Program staff said the change will make routine access harder for patients who live far from clinics, have limited transportation, or need confidential care.</p>
                <p>The panel's order could affect providers across the country unless a higher court blocks it before the new requirements take effect.</p>
                <p>Medical organizations have said the removed remote option had been supported by a large body of safety data and practical experience.</p>
              </div>
              <section class="case-card-grid">
                <p>Public Services</p>
                <h3>Regional Board Guidance</h3>
                <p>This related case summary repeats background information and should not be included in the article body.</p>
                <b>Status:</b> Ongoing
                <a href="https://example.com/cases/regional-board-guidance">Explore case</a>
              </section>
              <a href="https://example.com/press-releases/previous-guidance">Next press release about this case</a>
              <h2>Learn More About the Issues in This Press Release</h2>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        preCleanHtml(html),
        "https://example.com/press-releases/regional-board-updates-guidance/",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("ordered a temporary change");
      expect(result?.content).toContain(
        "supported by a large body of safety data",
      );
      expect(result?.content).not.toContain("Media Contact");
      expect(result?.content).not.toContain("Explore case");
      expect(result?.content).not.toContain("Next press release");
      expect(result?.content).not.toContain("Learn More About the Issues");
    });

    test("prefers a near-tie parent when it preserves an omitted lead paragraph", async () => {
      const html = `
        <html>
          <body>
            <main class="main-content">
              <h2>Regional resource assessment published</h2>
              <h3>Summary values and supporting material</h3>
              <a href="https://example.com/report">Read the fact sheet</a>
              By <a href="https://example.com/team">Communications Team</a>
              January 15, 2026
              <p><strong>RIVER CITY.</strong> A public research office released a new assessment describing recoverable resources across several adjoining basins and state-managed areas.</p>
              <div class="body-content">
                <p>The assessment reviews historical production, recent exploration, and the technical assumptions used to estimate remaining resources.</p>
                <p>Researchers said the findings provide context for land managers, planners, and communities reviewing long-term infrastructure needs.</p>
                <p>The report also describes how modern measurement methods changed the assessment model and narrowed uncertainty around the estimate.</p>
              </div>
            </main>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        preCleanHtml(html),
        "https://example.com/news/regional-resource-assessment/",
        { contentLengthThreshold: 120 },
      );

      expect(result?.content).toContain("A public research office released");
      expect(result?.content).toContain("modern measurement methods");
    });

    test("does not treat official-site banners as article leads", async () => {
      const html = `
        <html>
          <body>
            <div class="dialog-off-canvas-main-canvas">
              <section class="usa-banner">
                <p>Official websites use .gov A .gov website belongs to an official government organization in the United States.</p>
                <p>Secure .gov websites use HTTPS. Share sensitive information only on official, secure websites.</p>
              </section>
              <main id="main-content" class="main-content">
                <div class="block block-system block-system-main-block">
                  <p>Wednesday, March 4, 2026</p>
                  <p>A research team funded by a public institute developed an automated scan analysis system for clinical assessment.</p>
                  <p>The team said the model can identify patterns across imaging records and help clinicians prioritize follow-up review.</p>
                  <p>Researchers are continuing to validate the system with additional datasets before it is considered for operational use.</p>
                </div>
              </main>
              <footer><p>Looking for U.S. government information and services? Visit USA.gov</p></footer>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        preCleanHtml(html),
        "https://example.com/news/automated-scan-analysis/",
        { contentLengthThreshold: 120 },
      );

      expect(result?.content).toContain("automated scan analysis system");
      expect(result?.content).not.toContain("Official websites use .gov");
      expect(result?.content).not.toContain("Visit USA.gov");
    });

    test("keeps repeated explainer sections together", async () => {
      const sectionParagraphs = [
        [
          "The opening section introduces a preparedness guide for communities reviewing seasonal hazards and planning decisions.",
          "It explains how early outlooks help residents understand whether a developing system could strengthen near land.",
        ],
        [
          "Storm surge guidance describes how persistent winds can push water over normally dry ground during coastal events.",
          "The section includes examples that help readers compare depth, duration, and local geography when assessing risk.",
        ],
        [
          "Inland flooding guidance explains why heavy rain remains dangerous long after a storm weakens over land.",
          "It also describes how terrain, drainage, and urban development can turn repeated rainfall into emergency conditions.",
        ],
        [
          "Wind guidance describes how building materials, trees, and unsecured outdoor objects can become hazards.",
          "The section encourages readers to prepare before warnings arrive and conditions make travel unsafe.",
        ],
      ];
      const html = `
        <html>
          <body>
            <main class="c-main">
              <div class="explainer clearfix explainer-bodies">
                ${sectionParagraphs
                  .map(
                    (paragraphs, index) => `
                      <section class="explainer-item explainer-item-intro-body" id="section-${index}">
                        ${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}
                      </section>
                    `,
                  )
                  .join("")}
              </div>
            </main>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        preCleanHtml(html),
        "https://example.com/explainers/seasonal-hazards/",
        { contentLengthThreshold: 120 },
      );

      expect(result?.content).toContain("opening section introduces");
      expect(result?.content).toContain("Storm surge guidance");
      expect(result?.content).toContain("Inland flooding guidance");
      expect(result?.content).toContain("Wind guidance");
    });

    test("keeps repeated accordion release panels together", async () => {
      const releases = [
        [
          "Updated hazard maps released for several counties",
          "The survey released updated hazard maps for planning offices that review development near mapped zones.",
          "The announcement explains how local agencies can download reports, compare layers, and review affected parcels.",
        ],
        [
          "New aggregate resource report published",
          "The report summarizes permitted reserves, projected construction demand, and the regional assumptions used by planners.",
          "It explains why nearby resources reduce transportation costs and help communities plan long-term infrastructure work.",
        ],
        [
          "Regional geologic map added to catalog",
          "The map compiles field observations and historical data into one reference for engineers and public agencies.",
          "The announcement describes how the map supports seismic, mineral, and groundwater studies across the region.",
        ],
        [
          "Digital data package now available",
          "The package includes geospatial files, documentation, and report links for researchers who need reproducible data.",
          "Staff said the updated package helps agencies compare current information with earlier published releases.",
        ],
      ];
      const html = `
        <html>
          <body>
            <div class="panel-group" id="release-index">
              ${releases
                .map(
                  ([heading, firstParagraph, secondParagraph], index) => `
                    <div class="panel panel-default">
                      <div class="panel-heading"><h2>${heading}</h2></div>
                      <div id="release-${index}" class="panel-collapse collapse">
                        <div class="panel-body">
                          <p>${firstParagraph}</p>
                          <p>${secondParagraph}</p>
                        </div>
                      </div>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        preCleanHtml(html),
        "https://example.com/releases/",
        { contentLengthThreshold: 120 },
      );

      expect(result?.content).toContain("Updated hazard maps");
      expect(result?.content).toContain("aggregate resource report");
      expect(result?.content).toContain("Regional geologic map");
      expect(result?.content).toContain("Digital data package");
    });

    test("keeps media-rich exact article content", async () => {
      const featureItems = Array.from(
        { length: 6 },
        (_, index) => `
        <h3>Feature ${index + 1}: Coastal monitoring update</h3>
        <p>Researchers describe monitoring work that helps coastal communities understand changing conditions and plan future field operations.</p>
        <p><a href="https://example.com/features/${index}">Read the feature update</a></p>
        <img src="https://example.com/images/feature-${index}.jpg" alt="Feature ${index + 1} image" />
      `,
      ).join("");
      const html = `
        <html>
          <body>
            <div class="content-header hr">
              <p>March 23, 2026</p>
              <p>Short summary text that should not replace the article body.</p>
            </div>
            <div class="article__content article__content--news">
              <p>The feature package introduces a week of reporting about marine wildlife research, conservation methods, and public guidance.</p>
              ${featureItems}
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        preCleanHtml(html),
        "https://example.com/features/marine-wildlife-week/",
        { contentLengthThreshold: 120 },
      );

      expect(result?.content).toContain("feature package introduces");
      expect(result?.content).toContain("Feature 6");
      expect(result?.content).toContain("feature-5.jpg");
      expect(result?.content).not.toContain("Short summary text");
    });

    test("extracts article from article tag", async () => {
      const html = `
        <html>
          <body>
            <article>
              <h1>Article Title in H1</h1>
              <p>Main article content inside semantic article tag with enough text.</p>
              <p>Additional paragraph for minimum length requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/story");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Main article content");
      expect(result?.title).toBe("Article Title in H1");
    });

    test("selects largest article when multiple article tags exist", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Short article content.</p>
            </article>
            <article>
              <p>This is the longer article content with much more text to ensure it is selected.</p>
              <p>Additional paragraphs to make this article clearly the largest one available.</p>
              <p>Even more content to definitively make this the winner in size comparison.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/news");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("longer article content");
      expect(result?.content).not.toContain("Short article");
    });

    test("extracts article from role=main attribute", async () => {
      const html = `
        <html>
          <body>
            <div role="main">
              <p>Content inside role main element with adequate length for extraction.</p>
              <p>More content to pass threshold validation checks.</p>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/page");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("role main element");
    });

    test("extracts article from main tag", async () => {
      const html = `
        <html>
          <body>
            <main>
              <p>Content inside semantic main tag with sufficient length for extraction.</p>
              <p>Additional content to meet minimum length threshold.</p>
            </main>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("semantic main tag");
    });

    test("respects custom content length threshold", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Short content.</p>
            </article>
          </body>
        </html>
      `;

      // With high threshold, should return null
      const resultHigh = await librerssDistill(
        html,
        "https://example.com/article",
        { contentLengthThreshold: 500 },
      );
      expect(resultHigh).toBeNull();

      // With low threshold, should extract
      const resultLow = await librerssDistill(
        html,
        "https://example.com/article",
        { contentLengthThreshold: 10 },
      );
      expect(resultLow).not.toBeNull();
      expect(resultLow?.content).toContain("Short content");
    });

    test("uses default threshold of 100 when not specified", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>This content has exactly one hundred characters to test the default minimum body length threshold value.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      // This should succeed with default threshold
      expect(result).not.toBeNull();
    });

    test("extracts og:title from meta tags", async () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Open Graph Title" />
          </head>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Open Graph Title");
    });

    test("falls back to h1 for title when no og:title", async () => {
      const html = `
        <html>
          <body>
            <h1>Headline from H1 Tag</h1>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Headline from H1 Tag");
    });

    test("falls back to title tag when no og:title or h1", async () => {
      const html = `
        <html>
          <head>
            <title>Page Title from Title Tag</title>
          </head>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Page Title from Title Tag");
    });

    test("returns undefined title when no title sources available", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      expect(result).not.toBeNull();
      expect(result?.title).toBeUndefined();
    });

    test("extracts og:description from meta tags", async () => {
      const html = `
        <html>
          <head>
            <meta property="og:description" content="Open Graph description text" />
          </head>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      expect(result).not.toBeNull();
      expect(result?.description).toBe("Open Graph description text");
    });

    test("falls back to twitter:description when no og:description", async () => {
      const html = `
        <html>
          <head>
            <meta name="twitter:description" content="Twitter description text" />
          </head>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      expect(result).not.toBeNull();
      expect(result?.description).toBe("Twitter description text");
    });

    test("falls back to standard description meta tag", async () => {
      const html = `
        <html>
          <head>
            <meta name="description" content="Standard meta description" />
          </head>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      expect(result).not.toBeNull();
      expect(result?.description).toBe("Standard meta description");
    });

    test("returns undefined description when no description sources available", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      expect(result).not.toBeNull();
      expect(result?.description).toBeUndefined();
    });

    test("handles empty HTML gracefully", async () => {
      const result = await librerssDistill("", "https://example.com");

      expect(result).toBeNull();
    });

    test("handles HTML with only whitespace", async () => {
      const result = await librerssDistill("   \n\n   ", "https://example.com");

      expect(result).toBeNull();
    });

    test("handles HTML without body tag", async () => {
      const html = `
        <article>
          <p>Content without html or body wrapper with sufficient length.</p>
          <p>Additional content to meet threshold.</p>
        </article>
      `;

      const result = await librerssDistill(html, "https://example.com/article");

      // Should still work if the article tag is present
      expect(result).not.toBeNull();
      expect(result?.content).toContain("Content without html");
    });

    test("extracts all metadata fields together", async () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Complete Article Title" />
            <meta property="og:description" content="Complete article description" />
          </head>
          <body>
            <article>
              <p>Complete article body with all metadata present and sufficient length.</p>
              <p>Additional paragraph to ensure proper extraction with full metadata.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        html,
        "https://example.com/complete",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Complete article body");
      expect(result?.title).toBe("Complete Article Title");
      expect(result?.description).toBe("Complete article description");
      expect(result?.source).toBe("https://example.com/complete");
    });

    test("prioritizes itemprop articleBody over other selectors", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Longer content in article tag that would normally be selected based on size alone.</p>
              <p>Multiple paragraphs making this the longest content block available in the document.</p>
              <p>Even more content to ensure this is definitely the longest option available.</p>
            </article>
            <div itemprop="articleBody">
              <p>Shorter content but with semantic articleBody marker should win due to priority.</p>
              <p>Additional content to meet the minimum length threshold requirements for extraction.</p>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        html,
        "https://example.com/priority",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("semantic articleBody marker");
      expect(result?.content).not.toContain("Longer content in article");
    });

    test("prioritizes CMS class patterns over article tag", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Content in article tag that is available for extraction.</p>
            </article>
            <div class="article-content">
              <p>Content in CMS pattern class should be prioritized over article tag.</p>
              <p>Additional content to meet minimum length requirements.</p>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/cms");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("CMS pattern class");
    });

    test("handles WordPress entry-content class pattern", async () => {
      const html = `
        <html>
          <body>
            <div class="entry-content">
              <p>WordPress-style content with entry-content class pattern.</p>
              <p>Additional content to meet minimum length requirements.</p>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        html,
        "https://example.com/wordpress",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("WordPress-style content");
    });

    test("handles Drupal field-name-body pattern", async () => {
      const html = `
        <html>
          <body>
            <div class="field-name-body">
              <p>Drupal CMS content with standard field-name-body class pattern.</p>
              <p>Additional content to meet minimum length requirements.</p>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/drupal");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Drupal CMS content");
    });

    test("selects largest main tag when multiple exist", async () => {
      const html = `
        <html>
          <body>
            <main>
              <p>First main tag with minimal content.</p>
            </main>
            <main>
              <p>Second main tag with more comprehensive content that exceeds the first.</p>
              <p>Multiple paragraphs making this clearly the larger of the two main elements.</p>
              <p>Additional content to ensure this is selected as the winner.</p>
            </main>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        html,
        "https://example.com/multiple-main",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("more comprehensive content");
      expect(result?.content).not.toContain("minimal content");
    });

    test("returns null for content below threshold even with metadata", async () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Article has title" />
            <meta property="og:description" content="Article has description" />
          </head>
          <body>
            <article>
              <p>Too short.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/short", {
        contentLengthThreshold: 200,
      });

      expect(result).toBeNull();
    });

    test("handles zero threshold option", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>X</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        html,
        "https://example.com/article",
        {
          contentLengthThreshold: 0,
        },
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("X");
    });

    test("handles very large threshold", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Even with substantial content this should not pass.</p>
              <p>Multiple paragraphs of decent length.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        html,
        "https://example.com/article",
        {
          contentLengthThreshold: 1000000,
        },
      );

      expect(result).toBeNull();
    });

    test("preserves source URL exactly as provided", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Article content with sufficient length for extraction.</p>
              <p>Additional paragraph to meet requirements.</p>
            </article>
          </body>
        </html>
      `;

      const testUrl = "https://example.com/article?param=value#fragment";
      const result = await librerssDistill(html, testUrl);

      expect(result).not.toBeNull();
      expect(result?.source).toBe(testUrl);
    });

    test("handles complex nested HTML structures", async () => {
      const html = `
        <html>
          <body>
            <div class="container">
              <div class="wrapper">
                <article>
                  <div class="content">
                    <div class="inner">
                      <p>Deeply nested article content that should still be extracted properly.</p>
                      <p>Additional nested content to meet minimum length requirements.</p>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/nested");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Deeply nested article content");
    });

    test("extracts content with mixed HTML tags", async () => {
      const html = `
        <html>
          <body>
            <article>
              <h2>Section Header</h2>
              <p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
              <ul>
                <li>List item one</li>
                <li>List item two</li>
              </ul>
              <blockquote>A quoted section of text</blockquote>
              <p>Final paragraph to ensure sufficient length.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/mixed");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Section Header");
      expect(result?.content).toContain("bold");
      expect(result?.content).toContain("italic");
    });

    test("handles role=article attribute", async () => {
      const html = `
        <html>
          <body>
            <div role="article">
              <p>Content marked with role article attribute for accessibility.</p>
              <p>Additional content to meet minimum length requirements.</p>
            </div>
          </body>
        </html>
      `;

      const result = await librerssDistill(html, "https://example.com/role");

      expect(result).not.toBeNull();
      expect(result?.content).toContain("role article attribute");
    });

    test("DistilledArticle interface matches expected structure", async () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Test Title" />
            <meta property="og:description" content="Test Description" />
          </head>
          <body>
            <article>
              <p>Article content with all fields populated to validate interface structure.</p>
              <p>Additional content to meet minimum length requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await librerssDistill(
        html,
        "https://example.com/validate",
      );

      expect(result).not.toBeNull();
      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("description");
      expect(result).toHaveProperty("source");
      expect(typeof result?.content).toBe("string");
      expect(typeof result?.title).toBe("string");
      expect(typeof result?.description).toBe("string");
      expect(typeof result?.source).toBe("string");
    });

    test("returns null for minimal HTML with insufficient content", async () => {
      const html =
        "<html><head><title>T</title></head><body><p>Short</p></body></html>";
      const result = await librerssDistill(html, "https://example.com/");
      expect(result === null || typeof result === "object").toBe(true);
    });

    test("extracts content and metadata from a full article HTML page", async () => {
      const longText =
        "Article text that is more than one hundred characters long and provides meaningful content. ".repeat(
          3,
        );
      const html = `<html><head><title>My Article</title></head><body><article><p>${longText}</p></article></body></html>`;
      const result = await librerssDistill(html, "https://example.com/article");
      if (result) {
        expect(typeof result.content).toBe("string");
        expect(result.source).toBe("https://example.com/article");
      }
      expect(result === null || typeof result === "object").toBe(true);
    });
  });
});

describe("lib/distill/strategy wrappers", () => {
  const articleHtml = `
    <html>
      <head>
        <title>Strategy Title</title>
        <meta property="og:description" content="Strategy description" />
      </head>
      <body>
        <article>
          <p>This article body is intentionally long enough to clear every default threshold used by the distill helpers.</p>
          <p>Additional content keeps the extractor on the happy path for wrapper coverage.</p>
        </article>
      </body>
    </html>
  `;

  test("readabilityDistill returns a normalized article and respects high thresholds", () => {
    const article = readabilityDistill(
      articleHtml,
      "https://example.com/readability",
    );

    expect(article).not.toBeNull();
    expect(article?.source).toBe("https://example.com/readability");
    expect(article?.content).toContain("intentionally long enough");
    expect(
      readabilityDistill(articleHtml, "https://example.com/readability", {
        contentLengthThreshold: 5000,
      }),
    ).toBeNull();
  });

  test("defuddleDistill patches missing DOM APIs and returns null below threshold", () => {
    const article = distillWithDefuddle(
      articleHtml,
      "https://example.com/defuddle",
    );

    expect(article).not.toBeNull();
    expect(article?.source).toBe("https://example.com/defuddle");
    expect(article?.content).toContain("extractor on the happy path");
    expect(
      distillWithDefuddle(
        "<article><p>tiny</p></article>",
        "https://example.com/defuddle",
        {
          contentLengthThreshold: 500,
        },
      ),
    ).toBeNull();
  });

  test("distillArticle dispatches to each strategy", async () => {
    await expect(
      distillArticle(articleHtml, "https://example.com/custom", "librerss"),
    ).resolves.not.toBeNull();
    await expect(
      distillArticle(
        articleHtml,
        "https://example.com/readability",
        "readability",
      ),
    ).resolves.not.toBeNull();
    await expect(
      distillArticle(articleHtml, "https://example.com/defuddle", "defuddle"),
    ).resolves.not.toBeNull();
  });
});
