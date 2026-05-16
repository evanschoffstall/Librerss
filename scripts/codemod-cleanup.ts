#!/usr/bin/env bun
/**
 * Codemod: structural naming cleanup.
 *
 * Renames placeholder-source leaf files to org-prefixed names, renames the
 * librerss distill strategy file and its exported function to the descriptive
 * "heuristic" name, and renames sanitization.ts to raw-content.ts.
 *
 * All import paths across the project are updated automatically by ts-morph.
 *
 * Run with: bun scripts/codemod-cleanup.ts.
 */

import { resolve } from "node:path";
import { Project } from "ts-morph";

const ROOT = resolve(import.meta.dir, "..");

const project = new Project({
  skipAddingFilesFromTsConfig: false,
  tsConfigFilePath: resolve(ROOT, "tsconfig.json"),
});

// ─── Pass 1: Symbol renames ──────────────────────────────────────────────────
// Symbol renames must run before file moves so ts-morph can still resolve
// declarations from their original paths.

const librerssFile = project.getSourceFileOrThrow(
  resolve(ROOT, "src/lib/distill/librerss.ts"),
);

const librerssDistillDecl = librerssFile.getFunctionOrThrow("librerssDistill");
librerssDistillDecl.rename("heuristicDistill");

console.log("  ✓ Renamed symbol: librerssDistill → heuristicDistill");

// ─── Pass 2: File moves ──────────────────────────────────────────────────────
// ts-morph.move() rewrites every import and re-export that referenced the old
// path so nothing is left dangling.

const PS = resolve(ROOT, "src/lib/core/placeholder-sources");

const moves: [string, string, string][] = [
  // Placeholder leaf files: section-named → org-prefixed
  [`${PS}/top.ts`, `${PS}/esa-top.ts`, "placeholder-sources/top → esa-top"],
  [
    `${PS}/earth.ts`,
    `${PS}/esa-earth.ts`,
    "placeholder-sources/earth → esa-earth",
  ],
  [
    `${PS}/human.ts`,
    `${PS}/esa-human.ts`,
    "placeholder-sources/human → esa-human",
  ],
  [
    `${PS}/breaking.ts`,
    `${PS}/nasa-breaking.ts`,
    "placeholder-sources/breaking → nasa-breaking",
  ],
  [
    `${PS}/learning.ts`,
    `${PS}/nasa-learning.ts`,
    "placeholder-sources/learning → nasa-learning",
  ],
  [
    `${PS}/news.ts`,
    `${PS}/nih-news.ts`,
    "placeholder-sources/news → nih-news",
  ],
  // Distill strategy: product-named file → descriptive name
  [
    resolve(ROOT, "src/lib/distill/librerss.ts"),
    resolve(ROOT, "src/lib/distill/heuristic.ts"),
    "distill/librerss → heuristic",
  ],
  // Sanitize: ambiguously-named file → descriptive name
  [
    resolve(ROOT, "src/lib/sanitize/sanitization.ts"),
    resolve(ROOT, "src/lib/sanitize/raw-content.ts"),
    "sanitize/sanitization → raw-content",
  ],
];

for (const [from, to, label] of moves) {
  const sf = project.getSourceFileOrThrow(from);
  sf.move(to);
  console.log(`  ✓ Moved: ${label}`);
}

// ─── Save ────────────────────────────────────────────────────────────────────
await project.save();

console.log("\nCodemod complete. All import paths updated.");
