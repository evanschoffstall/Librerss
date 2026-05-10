/**
 * Canonical example URL for the synthetic multi-article ownership fixture.
 */
export const MULTI_ARTICLE_OWNERSHIP_FIXTURE_URL =
  "https://example.com/news/regional-observatory-updates-vendor-s-access-policy/";

/**
 * Page-title text for the synthetic ownership fixture.
 */
export const MULTI_ARTICLE_OWNERSHIP_FIXTURE_TITLE =
  "Regional Observatory Updates Vendor's Access Policy";

/**
 * Distinctive lead sentence from the page-owning article body.
 */
export const MULTI_ARTICLE_OWNERSHIP_CURRENT_SENTENCE =
  "The regional observatory updated its access policy after auditors found that older intake steps delayed routine records requests.";

/**
 * Distinctive sentence from the denser unrelated article that must not win.
 */
export const MULTI_ARTICLE_OWNERSHIP_WRONG_SENTENCE =
  "The river monitoring team said the overnight sampling expansion will add two mobile stations and extend weekend analysis windows.";

/**
 * Build a synthetic multi-article page where the current article's winning
 * ownership signal is stored in a data-headline attribute that contains an
 * apostrophe, while a denser unrelated article competes for selection.
 * @returns HTML fixture that exercises page-ownership scoring.
 */
export function createMultiArticleOwnershipFixture(): string {
  return `
    <html>
      <head>
        <title>${MULTI_ARTICLE_OWNERSHIP_FIXTURE_TITLE}</title>
        <meta
          property="og:description"
          content="Operational guidance update covering access requests, intake review, and vendor coordination."
        />
      </head>
      <body>
        <div class="posts-custom posts-custom-section section-holder clearfix" data-source="current_post">
          <div class="posts-wrapper clearfix">
            <div class="widget post-partial post-section--notice" data-category="Updates">
              <article class="clearfix page-article sm-mb-1 quality-HD post-100" data-category="Updates">
                <div class="row px10">
                  <div class="rm-col-center col sm-mb-1">
                    <div class="widget__body clearfix sm-mt-1">
                      <h1 class="widget__headline h1">
                        <span class="widget__headline-text custom-post-headline">
                          ${MULTI_ARTICLE_OWNERSHIP_FIXTURE_TITLE}
                        </span>
                      </h1>
                    </div>
                  </div>
                </div>
                <div
                  class="body js-expandable clearfix js-listicle-body css-listicle-body-100"
                  data-headline="${MULTI_ARTICLE_OWNERSHIP_FIXTURE_TITLE}"
                >
                  <div class="body-description">
                    <p>${MULTI_ARTICLE_OWNERSHIP_CURRENT_SENTENCE}</p>
                    <p>The revised process standardizes vendor review, confirms delivery windows, and removes duplicate routing checkpoints that previously stalled requests.</p>
                    <p>Program staff said the update keeps the response workflow predictable while preserving the documentation needed for compliance reviews.</p>
                    <p>The observatory plans to publish a follow-up implementation note after the first month of the new process.</p>
                  </div>
                </div>
              </article>
            </div>
            <div class="widget post-partial post-section--analysis" data-category="Field Notes">
              <article class="clearfix image-article sm-mb-1 quality-HD post-200">
                <div class="row px10">
                  <div class="rm-col-center col sm-mb-1">
                    <div class="widget__head">
                      <h2>River Monitoring Team Expands Overnight Sampling</h2>
                    </div>
                  </div>
                </div>
                <div
                  class="body js-expandable clearfix js-listicle-body css-listicle-body-200"
                  data-headline="River Monitoring Team Expands Overnight Sampling"
                >
                  <div class="body-description">
                    <p>${MULTI_ARTICLE_OWNERSHIP_WRONG_SENTENCE}</p>
                    <p>Project coordinators said the sampling expansion will help technicians compare river chemistry during peak runoff and lower-flow intervals.</p>
                    <p>The additional coverage also gives regional analysts more weekend observations to compare with weekday baseline reports.</p>
                    <p>Field crews will rotate between shoreline sites so instrument calibrations stay aligned across the broader schedule.</p>
                    <p>Laboratory staff expect the wider schedule to produce denser reporting for seasonal summaries and quarterly planning updates.</p>
                    <p>Managers said the sampling change is intended to improve continuity during longer weather transitions and maintenance windows.</p>
                    <p>The team will review the first month of expanded runs before deciding whether to keep the overnight schedule through the next quarter.</p>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}
