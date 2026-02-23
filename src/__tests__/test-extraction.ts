#!/usr/bin/env bun

export { };

/**
 * Test what the extraction API returns for a motherjones article URL
 */

const testUrl =
  "https://www.motherjones.com/politics/2026/02/jeffrey-epstein-files-howard-lutnick-email-cantor-fitzgerald/";

console.log("Testing extraction endpoint...\n");
console.log(`URL: ${testUrl}\n`);

try {
  const response = await fetch("http://localhost:3000/api/articles/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: process.env.TEST_COOKIE || "",
    },
    body: JSON.stringify({ url: testUrl }),
  });

  if (!response.ok) {
    console.error(`HTTP ${response.status}: ${response.statusText}`);
    process.exit(1);
  }

  const data = await response.json();
  const content = data.content || "";

  console.log("=".repeat(80));
  console.log("EXTRACTION API RESPONSE:");
  console.log("=".repeat(80));
  console.log(`Content length: ${content.length} chars`);
  console.log(`Truncated: ${content.includes("[content truncated]")}\n`);

  console.log("First 500 chars:");
  console.log("-".repeat(80));
  console.log(content.substring(0, 500));
  console.log("-".repeat(80));
} catch (error) {
  console.error("Error:", error);
  process.exit(1);
}
