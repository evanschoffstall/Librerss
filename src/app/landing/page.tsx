"use client";

import { DebugBorder, DebugGrid, Menubar, Space } from "@/src/components";
import { ENV, LANDING_CONTENT } from "@/src/lib";
import { multiLine } from "@/src/lib/textUtils";
import { useSearchParams } from "next/navigation";
import React from "react";

// About Component
const AboutView = () => (
  <div>
    <p className="text-4xl font-bold">About</p>
    <p className="py-4">
      In the tradition of not only open internet, and in revival of the
      ideology long discontinued marvel, Google Reader-- LibreRSS is a free
      cloud RSS service and reader that allows users to subscribe to any RSS
      feed and read their favorite websites in a single place.
    </p>
    <p className="py-4">
      RSS feeds are collections of articles from websites that are updated
      regularly. They allow users to keep up with their favorite websites
      without having to visit them individually.
    </p>
    <p className="py-4">
      LibreRSS allows users to subscribe to any RSS feed and read their
      favorite websites in a single place, without ads, in a standardized
      minimalist format, across any device.
    </p>
    <p className="py-4">
      LibreRSS is the only free alternative of all public RSS Cloud Service
      offerings to the logical conclusion ideologically opposed to any kind of
      paid feature. That&apos;s just the tip of the iceberg. LibreRSS boasts full
      open source to the entire suite of products and services that include
      its own self hostable reader and service with modern minimalist designs.
    </p>
  </div>
);

// Contact Component
const ContactView = () => (
  <div>
    <p className="text-4xl font-bold">Contact</p>
    <p className="py-4">Get in touch with us!</p>
    <p>Contact functionality coming soon...</p>
  </div>
);

// Main Landing Component
const LandingView = () => {
  const { title, subtitle, features, description } = LANDING_CONTENT;

  return (
    <div className="text-center">
      <p className="luxury-title mt-28">{title.main}</p>
      <p className="luxury-title-cap-adjusted mb-16">{title.secondary}</p>

      <div className="luxury-subtitle mb-24">
        {multiLine(subtitle, 3, 2)}
      </div>

      <h3 className="py-2 mb-16">
        {features.map((feature, index) => (
          <React.Fragment key={feature}>
            {feature}
            {index < features.length - 1 && <br />}
          </React.Fragment>
        ))}
      </h3>

      <div className="space-y-4">
        <p className="py-4">{description.intro}</p>
        <p className="py-4">{description.mission}</p>
        <p className="py-4">{description.legacy}</p>
      </div>
    </div>
  );
};

export default function Landing() {
  const searchParams = useSearchParams();
  const view = searchParams?.get('view') || 'home';

  let content;
  switch (view) {
    case 'about':
      content = <AboutView />;
      break;
    case 'contact':
      content = <ContactView />;
      break;
    default:
      content = <LandingView />;
  }

  return (
    <>
      {ENV.isDevelopment && (
        <>
          <DebugBorder />
          <DebugGrid />
        </>
      )}
      <Space />
      <div className="glass" style={{ display: "flex", flexDirection: "column" }}>
        <Menubar />
        <div style={{ flex: 1, overflow: "auto", overscrollBehavior: "contain" }}>
          <main className="m-10">
            <div className="m-5 pt-10">{content}</div>
          </main>
        </div>
      </div>
    </>
  );
}
