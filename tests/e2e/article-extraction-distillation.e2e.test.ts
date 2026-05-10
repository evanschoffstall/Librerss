import { librerssDistill } from "@/lib/distill/librerss";
import {
  cleanSanitizedHtml,
  preCleanHtml,
  sanitizeRawContent,
} from "@/lib/sanitize";
import { assertExtractableArticleHtml } from "@/lib/server";

import { expect, test } from "./test";

/**
 * Builds the Akamai access interstitial shape observed when a source returns a
 * nominal HTTP 200 response that is not article content.
 * @returns HTML fixture that must stop before distillation or sanitization.
 */
function createAkamaiAccessInterstitialFixture(): string {
  return `
    <!doctype html>
    <html>
      <body>
        <script src="/CtzWON35h/qtzwJC/FOg/tNEwwtOV/HQMKMBYB/FlkOWmx/CBFYr"></script>
        <div id="sec-if-cpt-container" role="main" style="display: none">
          <div class="behavioral-content">
            <div id="sec-bc-text-container"></div>
            <div class="scf-akamai-logo-sec-abc">
              <p class="scf-akamai-protected-by">Powered and protected by</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Builds a compact article shape where the real body uses camel-case naming and
 * a later sponsored module uses the broader hyphenated class.
 * @returns HTML fixture that exercises selector priority for body classes.
 */
function createCamelCaseArticleBodyFixture(): string {
  return `
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
}

/**
 * Builds a compact CMS article whose lead image filename begins with `Close-up`,
 * which should be treated as photography rather than close-button chrome.
 * @returns HTML fixture that exercises lead image filtering.
 */
function createCloseUpLeadImageFixture(): string {
  const metadataSpacer = `<div>${"Photo metadata and share controls. ".repeat(260)}</div>`;

  return `
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
}

/**
 * Builds a compact CMS article shape where WordPress places the featured image
 * as a sibling immediately before the selected entry-content text.
 * @returns HTML fixture that exercises semantic body selection with lead media.
 */
function createCmsFeaturedImageFixture(): string {
  return `
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
}

/**
 * Builds a short article paragraph followed by a stripped download CTA that
 * would otherwise leave duplicate sentence punctuation behind.
 * @returns HTML fixture that must collapse punctuation after CTA removal.
 */
function createDownloadCtaPunctuationFixture(): string {
  return `
    <html>
      <body>
        <main class="article-content">
          <p>
            The report is available as a single PDF file, which can be viewed using Adobe Acrobat Reader.
            <a href="https://example.com/download">Follow this link to download the report</a>.
          </p>
          <p>The publication summarizes the historical record and the current findings in one document.</p>
        </main>
      </body>
    </html>
  `;
}

/**
 * Builds a long metadata preamble before the real body paragraph, matching
 * public-sector release pages that place title, dek, factsheet CTA, and byline
 * above the lead paragraph.
 * @returns HTML fixture that must strip the metadata preamble.
 */
function createLongLeadingPreambleFixture(): string {
  return `
    <html>
      <body>
        <main class="main-content">
          <h2>USGS releases assessment of undiscovered oil and gas resources in Woodford and Barnett shales</h2>
          <h3>28.3 trillion cubic feet of gas, 1.6 billion barrels of oil estimated in New Mexico, Texas</h3>
          <a href="https://example.com/factsheet">Read the factsheet on undiscovered oil and gas in the Woodford Shale and Barnett</a>
          By <a href="https://example.com/team">Communications and Publishing</a>
          January 14, 2026
          <div class="body-content">
            <p><strong>RESTON, Va.</strong> The U.S. Geological Survey released its assessment of undiscovered gas and oil in the Woodford and Barnett shales in the Permian Basin.</p>
            <p>Since production began in the late 1990s, the Woodford and Barnett shales have produced millions of barrels of oil and remain an important source of domestic energy.</p>
            <p>The agency said the assessment provides context for land managers and planners reviewing long-term resource conditions.</p>
          </div>
        </main>
      </body>
    </html>
  `;
}

/**
 * Builds an exact article-content page with enough media cards to exercise the
 * lower confidence gate for explicitly marked article bodies.
 * @returns HTML fixture that must prefer exact article content over a summary header.
 */
function createMediaRichArticleContentFixture(): string {
  const featureItems = Array.from(
    { length: 6 },
    (_, index) => `
      <h3>Feature ${index + 1}: Coastal monitoring update</h3>
      <p>Researchers describe monitoring work that helps coastal communities understand changing conditions and plan future field operations.</p>
      <p><a href="https://example.com/features/${index}">Read the feature update</a></p>
      <img src="https://example.com/images/feature-${index}.jpg" alt="Feature ${index + 1} image" />
    `,
  ).join("");

  return `
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
}

/**
 * Builds a compact press-release page where contact details and related-case
 * modules sit inside the same broad article wrapper as the real release body.
 * @returns HTML fixture that exercises confidence selection over wrapper size.
 */
function createNoisyPressReleaseFixture(): string {
  return `
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
}

/**
 * Builds an index page whose repeated accordion panels are the readable content
 * surface rather than unrelated page chrome.
 * @returns HTML fixture that exercises repeated accordion group selection.
 */
function createRepeatedAccordionFixture(): string {
  return `
    <html>
      <body>
        <div class="panel-group" id="release-index">
          <div class="panel panel-default">
            <div class="panel-heading"><h2>Updated hazard maps released for several counties</h2></div>
            <div class="panel-collapse collapse"><div class="panel-body">
              <p>The survey released updated hazard maps for planning offices that review development near mapped zones.</p>
              <p>The announcement explains how local agencies can download reports, compare layers, and review affected parcels.</p>
            </div></div>
          </div>
          <div class="panel panel-default">
            <div class="panel-heading"><h2>New aggregate resource report published</h2></div>
            <div class="panel-collapse collapse"><div class="panel-body">
              <p>The report summarizes permitted reserves, projected construction demand, and the regional assumptions used by planners.</p>
              <p>It explains why nearby resources reduce transportation costs and help communities plan long-term infrastructure work.</p>
            </div></div>
          </div>
          <div class="panel panel-default">
            <div class="panel-heading"><h2>Regional geologic map added to catalog</h2></div>
            <div class="panel-collapse collapse"><div class="panel-body">
              <p>The map compiles field observations and historical data into one reference for engineers and public agencies.</p>
              <p>The announcement describes how the map supports seismic, mineral, and groundwater studies across the region.</p>
            </div></div>
          </div>
          <div class="panel panel-default">
            <div class="panel-heading"><h2>Digital data package now available</h2></div>
            <div class="panel-collapse collapse"><div class="panel-body">
              <p>The package includes geospatial files, documentation, and report links for researchers who need reproducible data.</p>
              <p>Staff said the updated package helps agencies compare current information with earlier published releases.</p>
            </div></div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Builds a multi-section explainer where each repeated item is article prose,
 * so extraction must keep the wrapper instead of one high-scoring section.
 * @returns HTML fixture that exercises repeated explainer body selection.
 */
function createRepeatedExplainerFixture(): string {
  return `
    <html>
      <body>
        <main class="c-main">
          <div class="explainer clearfix explainer-bodies">
            <section class="explainer-item explainer-item-intro-body">
              <p>The opening section introduces a preparedness guide for communities reviewing seasonal hazards and planning decisions.</p>
              <p>It explains how early outlooks help residents understand whether a developing system could strengthen near land.</p>
            </section>
            <section class="explainer-item explainer-item-intro-body">
              <p>Storm surge guidance describes how persistent winds can push water over normally dry ground during coastal events.</p>
              <p>The section includes examples that help readers compare depth, duration, and local geography when assessing risk.</p>
            </section>
            <section class="explainer-item explainer-item-intro-body">
              <p>Inland flooding guidance explains why heavy rain remains dangerous long after a storm weakens over land.</p>
              <p>It also describes how terrain, drainage, and urban development can turn repeated rainfall into emergency conditions.</p>
            </section>
            <section class="explainer-item explainer-item-intro-body">
              <p>Wind guidance describes how building materials, trees, and unsecured outdoor objects can become hazards.</p>
              <p>The section encourages readers to prepare before warnings arrive and conditions make travel unsafe.</p>
            </section>
          </div>
        </main>
      </body>
    </html>
  `;
}

/**
 * Builds a page with a generic service-security banner before the real article
 * content.
 * @returns HTML fixture that must not promote service notice copy as article lead prose.
 */
function createServiceBannerArticleFixture(): string {
  return `
    <html>
      <body>
        <div class="shell">
          <section class="site-banner">
            <p>Official website notice: secure websites protect account settings and service information before you continue.</p>
            <p>Review privacy settings and share sensitive information only through the secure service portal.</p>
          </section>
          <main id="main-content" class="main-content">
            <div class="block block-system block-system-main-block">
              <p>Wednesday, March 4, 2026</p>
              <p>A research team funded by a public institute developed an automated scan analysis system for clinical assessment.</p>
              <p>The team said the model can identify patterns across imaging records and help clinicians prioritize follow-up review.</p>
              <p>Researchers are continuing to validate the system with additional datasets before it is considered for operational use.</p>
            </div>
          </main>
          <footer><p>Need account help or service settings? Visit the support portal.</p></footer>
        </div>
      </body>
    </html>
  `;
}

/**
 * Builds an article where a sidebar metadata rail sits before the real entry
 * content inside a broader wrapper.
 * @returns HTML fixture that must not widen to the metadata rail.
 */
function createSidebarMetadataRailFixture(): string {
  return `
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
}

/**
 * Builds a CMS article where the lead paragraph is a sibling before the nested
 * body field, matching public-sector pages that split summaries from body text.
 * @returns HTML fixture that must keep the lead paragraph and body together.
 */
function createSplitLeadArticleFixture(): string {
  return `
    <html>
      <body>
        <main class="main-content">
          <h2>Regional resource assessment published</h2>
          <h3>Summary values and supporting material</h3>
          <a href="https://example.com/report">Read the fact sheet</a>
          By <a href="https://example.com/team">Communications Team</a>
          January 15, 2026
          <p><strong>RIVER CITY.</strong> A public research office released a new assessment describing recoverable resources across several adjoining basins and state-managed areas.</p>
          <a href="https://example.com/media/assessment-map">Media <img src="https://example.com/images/assessment-map.png" width="900" height="600" alt="Assessment map" /></a>
          Source/Credit: Provided handout.
          <a href="https://example.com/media/assessment-map">View Media Details</a>
          <div class="body-content">
            <p>The assessment reviews historical production, recent exploration, and the technical assumptions used to estimate remaining resources.</p>
            <p>Researchers said the findings provide context for land managers, planners, and communities reviewing long-term infrastructure needs.</p>
            <p>The report also describes how modern measurement methods changed the assessment model and narrowed uncertainty around the estimate.</p>
          </div>
        </main>
      </body>
    </html>
  `;
}

/**
 * Builds a feature article where related-news cards and taxonomy links trail the
 * complete article body inside the selected content wrapper.
 * @returns HTML fixture that must trim trailing recommendation chrome.
 */
function createTrailingRelatedChromeFixture(): string {
  return `
    <html>
      <body>
        <main class="article-content">
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
        </main>
      </body>
    </html>
  `;
}

test.describe("article extraction distillation", () => {
  test("keeps a CMS featured image next to selected entry content", async () => {
    const result = librerssDistill(
      createCmsFeaturedImageFixture(),
      "https://example.com/stories/2026/5/3/800030229/research/observation-deck-notes/",
      { contentLengthThreshold: 120 },
    );

    expect(result?.content).toContain("lead-observation.jpg?w=1024");
    expect(result?.content).toContain(
      "A field illustration from the observation team.",
    );
    expect(result?.content).toContain("Observation methods used");
  });

  test("keeps close-up lead images", async () => {
    const result = librerssDistill(
      preCleanHtml(createCloseUpLeadImageFixture()),
      "https://example.com/news/field-exam/",
      { contentLengthThreshold: 120 },
    );

    expect(result?.content).toContain("Close-up_field_exam.jpg");
    expect(result?.content).toContain("field exam helped identify patterns");
  });

  test("prefers camel case article body over sponsored callout copy", async () => {
    const result = librerssDistill(
      preCleanHtml(createCamelCaseArticleBodyFixture()),
      "https://example.com/news/security/learning-platform-data-exposure/",
    );

    expect(result?.content).toContain("platform-dashboard.jpg");
    expect(result?.content).toContain("account data was exposed");
    expect(result?.content).toContain("application keys");
    expect(result?.content).not.toContain("autonomous-validation2.jpg");
    expect(result?.content).not.toContain("Claim Your Spot");
  });

  test("keeps release content separate from contact and related-case modules", async () => {
    const result = librerssDistill(
      preCleanHtml(createNoisyPressReleaseFixture()),
      "https://example.com/press-releases/regional-board-updates-guidance/",
    );

    expect(result?.content).toContain("ordered a temporary change");
    expect(result?.content).toContain(
      "supported by a large body of safety data",
    );
    expect(result?.content).not.toContain("Media Contact");
    expect(result?.content).not.toContain("Explore case");
    expect(result?.content).not.toContain("Next press release");
    expect(result?.content).not.toContain("Learn More About the Issues");
  });

  test("keeps split lead prose and image while removing utility chrome", async () => {
    const result = librerssDistill(
      preCleanHtml(createSplitLeadArticleFixture()),
      "https://example.com/news/regional-resource-assessment/",
      { contentLengthThreshold: 120 },
    );
    const cleaned = cleanSanitizedHtml(
      sanitizeRawContent(result?.content ?? ""),
      "https://example.com/news/regional-resource-assessment/",
    );

    expect(cleaned).toContain("A public research office released");
    expect(cleaned).toContain("modern measurement methods");
    expect(cleaned).toContain("assessment-map.png");
    expect(cleaned).not.toContain("Read the fact sheet");
    expect(cleaned).not.toContain("Communications Team");
    expect(cleaned).not.toContain("Source/Credit");
    expect(cleaned).not.toContain("View Media Details");
  });

  test("does not widen to sidebar metadata rails before the true entry content", async () => {
    const result = librerssDistill(
      preCleanHtml(createSidebarMetadataRailFixture()),
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

  test("removes long leading metadata preambles before release body prose", async () => {
    const result = librerssDistill(
      preCleanHtml(createLongLeadingPreambleFixture()),
      "https://example.com/news/woodford-barnett-assessment/",
      { contentLengthThreshold: 120 },
    );
    const cleaned = cleanSanitizedHtml(
      sanitizeRawContent(result?.content ?? ""),
      "https://example.com/news/woodford-barnett-assessment/",
    );

    expect(cleaned).toContain("RESTON, Va.");
    expect(cleaned).toContain("important source of domestic energy");
    expect(cleaned).not.toContain("Read the factsheet");
    expect(cleaned).not.toContain("Communications and Publishing");
    expect(cleaned).not.toContain("January 14, 2026");
  });

  test("collapses punctuation gaps after download cta removal", async () => {
    const result = librerssDistill(
      preCleanHtml(createDownloadCtaPunctuationFixture()),
      "https://example.com/report/downloads/",
      { contentLengthThreshold: 120 },
    );
    const cleaned = cleanSanitizedHtml(
      sanitizeRawContent(result?.content ?? ""),
      "https://example.com/report/downloads/",
    );

    expect(cleaned).toContain("Adobe Acrobat Reader.");
    expect(cleaned).not.toContain("Reader. .");
    expect(cleaned).not.toContain("Follow this link to download");
  });

  test("keeps repeated explainer sections together", async () => {
    const result = librerssDistill(
      preCleanHtml(createRepeatedExplainerFixture()),
      "https://example.com/explainers/seasonal-hazards/",
      { contentLengthThreshold: 120 },
    );

    expect(result?.content).toContain("opening section introduces");
    expect(result?.content).toContain("Storm surge guidance");
    expect(result?.content).toContain("Inland flooding guidance");
    expect(result?.content).toContain("Wind guidance");
  });

  test("removes trailing related-news chrome", async () => {
    const result = librerssDistill(
      preCleanHtml(createTrailingRelatedChromeFixture()),
      "https://example.com/feature-story/marsh-habitat/",
      { contentLengthThreshold: 120 },
    );
    const cleaned = cleanSanitizedHtml(
      sanitizeRawContent(result?.content ?? ""),
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

  test("does not treat generic service banners as article leads", async () => {
    const result = librerssDistill(
      preCleanHtml(createServiceBannerArticleFixture()),
      "https://example.com/news/automated-scan-analysis/",
      { contentLengthThreshold: 120 },
    );

    expect(result?.content).toContain("automated scan analysis system");
    expect(result?.content).not.toContain("secure service portal");
    expect(result?.content).not.toContain("support portal");
  });

  test("keeps repeated accordion release panels together", async () => {
    const result = librerssDistill(
      preCleanHtml(createRepeatedAccordionFixture()),
      "https://example.com/releases/",
      { contentLengthThreshold: 120 },
    );

    expect(result?.content).toContain("Updated hazard maps");
    expect(result?.content).toContain("aggregate resource report");
    expect(result?.content).toContain("Regional geologic map");
    expect(result?.content).toContain("Digital data package");
  });

  test("keeps media-rich exact article content", async () => {
    const result = librerssDistill(
      preCleanHtml(createMediaRichArticleContentFixture()),
      "https://example.com/features/marine-wildlife-week/",
      { contentLengthThreshold: 120 },
    );

    expect(result?.content).toContain("feature package introduces");
    expect(result?.content).toContain("Feature 6");
    expect(result?.content).toContain("feature-5.jpg");
    expect(result?.content).not.toContain("Short summary text");
  });

  test("rejects source access interstitials before empty extraction succeeds", async () => {
    expect(() =>
      assertExtractableArticleHtml(createAkamaiAccessInterstitialFixture()),
    ).toThrow("Akamai");
  });
});
