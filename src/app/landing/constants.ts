// Landing page specific constants

// Navigation menu items
export const MENU_ITEMS = [
  { href: "#top", label: "Landing", type: "scroll" as const },
  { href: "#about", label: "About", type: "scroll" as const },
  { href: "#contact", label: "Contact", type: "scroll" as const },
] as const;

// Landing page content
export const LANDING_CONTENT = {
  title: { main: "LIBRE", secondary: "RSS" },
  subtitle: "Reviving the free cloud tradition",
  features: ["Free", "Modern", "Cloud Service", "Reader", "No Ads", "Open Source"],
  description: {
    intro: `LibreRSS is a free cloud RSS service and reader that allows users to subscribe 
            to any RSS feed and read their favorite websites in a single place, without ads, 
            in a standardized minimalist format, across any device.`,
    mission: `In the tradition of the open internet, and in revival of the ideology of 
             Google Reader, LibreRSS provides a completely free alternative to paid RSS 
             services with no advertising or subscription fees.`,
    legacy: `Twenty years ago, Google Reader (2005-2013) was the original pioneering 
            free RSS cloud service, lasting 8 years. LibreRSS aims to capture that same 
            magic of long-lasting free accessibility and low mental overhead.`,
  },
  cta: {
    primary: "Get Started Free",
    secondary: "Learn More",
    getStarted: "Get Started"
  },
  sections: {
    features: {
      title: "Features",
      subtitle: "Everything you need for a modern RSS experience."
    },
    about: {
      title: "Why Choose LibreRSS?",
      subtitle: "Everything you need for a modern RSS experience, completely free and open source.",
      content: [
        `In the tradition of not only open internet, and in revival of the
         ideology long discontinued marvel, Google Reader-- LibreRSS is a free
         cloud RSS service and reader that allows users to subscribe to any RSS
         feed and read their favorite websites in a single place.`,
        `RSS feeds are collections of articles from websites that are updated
         regularly. They allow users to keep up with their favorite websites
         without having to visit them individually.`,
        `LibreRSS allows users to subscribe to any RSS feed and read their
         favorite websites in a single place, without ads, in a standardized
         minimalist format, across any device.`,
        `LibreRSS is the only free alternative of all public RSS Cloud Service
         offerings to the logical conclusion ideologically opposed to any kind of
         paid feature. That's just the tip of the iceberg. LibreRSS boasts full
         open source to the entire suite of products and services that include
         its own self hostable reader and service with modern minimalist designs.`
      ]
    },
    contact: {
      title: "Contact Us",
      greeting: "Get in touch with us!",
      comingSoon: "Contact functionality coming soon...",
      status: [
        "Building something amazing",
        "Stay tuned for updates"
      ]
    }
  },
  trustIndicators: [
    { text: "100% Free", color: "green" },
    { text: "Open Source", color: "blue" },
    { text: "No Ads", color: "purple" }
  ]
} as const;
