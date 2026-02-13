import { type Article, type CategoryTreeNode } from "@/src/lib";

export const DEFAULT_FEED_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";
export const DEFAULT_CATEGORY_LABEL = "My Feeds";
export const DEV_PLACEHOLDER_CATEGORY_LABEL = "Placeholder Feeds";

export const DEV_PLACEHOLDER_FEED_SOURCES = [
  { name: "World News", url: DEFAULT_FEED_URL, category: DEV_PLACEHOLDER_CATEGORY_LABEL },
  { name: "Technology", url: "https://techcrunch.com/feed/", category: DEV_PLACEHOLDER_CATEGORY_LABEL },
  {
    name: "Science",
    url: "https://feeds.feedburner.com/oreilly/radar",
    category: DEV_PLACEHOLDER_CATEGORY_LABEL,
  },
];

export const INITIAL_CATEGORIES: CategoryTreeNode[] = [
  {
    key: "0",
    label: DEFAULT_CATEGORY_LABEL,
    children: [],
  },
];

export const SAMPLE_FEEDS = [
  {
    name: "BBC World News",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
  },
  { name: "Reuters", url: "http://feeds.reuters.com/reuters/topNews" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "Hacker News", url: "https://feeds.feedburner.com/ycombinator" },
];

const MINUTE = 60 * 1000;

export const DEV_PLACEHOLDER_ARTICLES: Article[] = [
  {
    id: -1,
    title: "Global EV battery prices drop 18% as storage demand accelerates",
    link: "https://example.com/news/ev-battery-prices-2026",
    content:
      "Analysts report the sharpest year-over-year decline in battery pack costs since 2020, with utility-scale storage projects driving most of the momentum across Europe and Southeast Asia. Procurement teams say cheaper LFP chemistry and better shipping capacity reduced lead times in Q4, while grid operators are accelerating long-duration pilots in markets that previously paused deployments. In Germany, two municipal utilities said new contracts now include indexed pricing tied to lithium carbonate benchmarks, allowing cities to schedule procurement in smaller tranches instead of locking full-year commitments all at once. Manufacturers also credited improved electrode yield rates and cleaner formation-line telemetry for reducing scrap, which translates directly into lower per-kWh costs at pack assembly. Policy analysts caution that commodity volatility has not disappeared, but they note the current cycle appears broader than a one-quarter correction because cost declines are now visible in both utility projects and fleet electrification bids.",
    publication_date: new Date(Date.now() - 18 * MINUTE),
    last_checked: new Date(Date.now() - 5 * MINUTE),
    feed_id: 0,
  },
  {
    id: -2,
    title:
      "Open-source browser engine announces first stable release for embedded apps",
    link: "https://example.com/tech/embedded-browser-engine-stable",
    content:
      "The project reached 1.0 with improved memory limits and WASM startup times, targeting kiosks, POS terminals, and low-power Linux devices used in field operations. Maintainers also published a hardened sandbox profile and long-term support cadence, which vendors say lowers integration risk for regulated environments that require predictable patch windows. The release includes deterministic rendering checkpoints so system integrators can capture frame timings in CI and flag regressions before firmware rollout, a feature that several payment-terminal vendors described as essential for reliability audits. Contributors added a compatibility layer for legacy GPU drivers common in industrial hardware, reducing the need for private downstream forks that previously delayed security updates. Documentation now ships with an embedded deployment playbook covering certificate pinning, crash-loop recovery, and offline bundle signatures, making it easier for teams to standardize deployment pipelines across mixed hardware fleets.",
    publication_date: new Date(Date.now() - 42 * MINUTE),
    last_checked: new Date(Date.now() - 6 * MINUTE),
    feed_id: 0,
  },
  {
    id: -3,
    title:
      "Researchers map coral reef recovery hotspots using low-cost drone imagery",
    link: "https://example.com/science/coral-recovery-hotspots",
    content:
      "A new segmentation model trained on volunteer image sets helps marine teams identify resilient reef zones and prioritize restoration where intervention has the highest impact. Field groups in Indonesia and Belize report that map-first planning reduced survey hours and improved seasonal timing for coral fragment outplanting after storm-related bleaching events. Researchers say the model performs best when paired with inexpensive multispectral filters, which capture subtle differences in tissue reflectance and make early stress signals easier to detect before visible bleaching sets in. Local conservation teams are using the hotspot maps to coordinate dive schedules, spare-boat fuel, and nursery capacity, allowing more colonies to be transplanted during calm-water windows that were previously missed. Early monitoring indicates that restoration plots selected with the new workflow show higher juvenile fish return rates and better coral attachment stability, though scientists emphasize that long-term outcomes still depend on broader water-quality improvements and temperature trends.",
    publication_date: new Date(Date.now() - 95 * MINUTE),
    last_checked: new Date(Date.now() - 11 * MINUTE),
    feed_id: 0,
  },
  {
    id: -4,
    title:
      "City transit pilot cuts average commute delays with adaptive signal timing",
    link: "https://example.com/world/adaptive-transit-signals",
    content:
      "After a six-month trial, three major corridors saw measurable improvements in bus punctuality and reduced congestion during peak periods through intersection-level coordination. Transportation officials plan a second phase that includes emergency-vehicle preemption logic and rider-facing reliability dashboards so service changes can be evaluated in near real time. According to the city mobility office, average dwell-adjusted delays fell most on routes with tightly spaced stops, where older fixed-cycle timing repeatedly trapped buses behind left-turn queues at the same intersections each morning. Engineers also introduced weather-aware timing profiles that lengthen pedestrian clearance in heavy rain while preserving transit priority when bus bunching crosses a threshold, reducing the tradeoff between safety and schedule adherence. Rider groups welcomed the pilot but asked for stronger communication on temporary route detours and weekend behavior, noting that trust in the system improves when passengers can compare before-and-after reliability using simple public metrics.",
    publication_date: new Date(Date.now() - 2 * 60 * MINUTE),
    last_checked: new Date(Date.now() - 14 * MINUTE),
    feed_id: 0,
  },
  {
    id: -5,
    title:
      "Developer survey highlights renewed interest in local-first web architecture",
    link: "https://example.com/engineering/local-first-architecture-survey",
    content:
      "Teams cite offline reliability, lower backend complexity, and faster prototyping as the top reasons for adopting sync engines and conflict-free data models. Respondents also noted improved perceived performance in mobile contexts where intermittent connectivity previously caused state loss and forced costly recovery flows. Product teams reported that adopting local-first patterns changed feature planning itself, because designers could assume instant interactions and defer network reconciliation to background tasks without degrading core usability. Several companies said support tickets tied to accidental data loss dropped after introducing durable local journals with explicit conflict history, giving users confidence that edits would survive app restarts and network drops. The survey also found that teams transitioning from traditional request-response architectures benefited most when they created clear ownership boundaries for sync rules, schema evolution, and merge policy testing, rather than spreading those decisions across unrelated frontend and backend squads.",
    publication_date: new Date(Date.now() - 4 * 60 * MINUTE),
    last_checked: new Date(Date.now() - 17 * MINUTE),
    feed_id: 0,
  },
  {
    id: -6,
    title:
      "Hydrogen shipping corridor secures cross-border infrastructure agreement",
    link: "https://example.com/business/hydrogen-shipping-corridor",
    content:
      "Port operators and regulators signed a phased plan for bunkering standards, safety protocols, and certification rules ahead of commercial deployment in 2027. The memorandum includes training requirements for dock crews, incident reporting templates, and a shared inspection framework to keep vessel turnaround times stable during early rollout. Infrastructure partners said the corridor will open with dual-fuel support so operators can transition gradually while crew certification programs scale, avoiding capacity shocks during the first two seasons of commercial traffic. Customs agencies in participating ports are aligning digital documentation formats for fuel provenance and emissions accounting, which should reduce duplicate filings for vessels operating multi-stop routes across jurisdictions. Industry observers describe the agreement as a practical milestone because it addresses not only fuel handling but also maintenance tooling, emergency response drills, and insurance language that historically slowed adoption of new marine propulsion systems.",
    publication_date: new Date(Date.now() - 7 * 60 * MINUTE),
    last_checked: new Date(Date.now() - 25 * MINUTE),
    feed_id: 0,
  },
];
