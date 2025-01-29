/* eslint-disable react/no-unescaped-entities */
"use client";

import React from "react";

export default function About() {
  return (
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
        {" "}
        LibreRSS allows users to subscribe to any RSS feed and read their
        favorite websites in a single place, without ads, in a standardized
        minimalist format, across any device.
      </p>
      <p className="py-4">
        LibreRSS is the only free alternative of all public RSS Cloud Service
        offerings to the logical conclusion ideologically opposed to any kind of
        paid feature. That's just the tip of the iceberg. LibreRSS boasts full
        open source to the entire suite of products and services that include
        its own self hostable reader and service with modern minimalist designs
        served by bleeding-edge stacks that afford luxury user experience.
      </p>
      <p className="py-4">
        Twenty years ago, Google Reader (2005-2013) was the original pioneering
        free RSS cloud service, lasting 8 years. Since then, many alternatives
        have been created, but none have been able to capture the same magic of
        long-lasting free accessability and mental overhead that Google Reader
        had.
      </p>
    </div>
  );
}
