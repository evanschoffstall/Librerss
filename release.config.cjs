require.resolve("conventional-changelog-conventionalcommits");
require.resolve("@semantic-release/commit-analyzer");
require.resolve("@semantic-release/git");
require.resolve("@semantic-release/release-notes-generator");
require.resolve("@semantic-release/npm");
require.resolve("@semantic-release/github");

const conventionalCommitSections = Object.freeze([
  { section: "Features", type: "feat" },
  { section: "Features", type: "feature" },
  { section: "Bug Fixes", type: "fix" },
  { section: "Performance Improvements", type: "perf" },
  { section: "Reverts", type: "revert" },
  { hidden: false, section: "Documentation", type: "docs" },
  { hidden: false, section: "Refactors", type: "refactor" },
  { hidden: false, section: "Chores", type: "chore" },
  { hidden: false, section: "Tests", type: "test" },
  { hidden: false, section: "Continuous Integration", type: "ci" },
  { hidden: false, section: "Build System", type: "build" },
  { hidden: true, section: "Styles", type: "style" },
]);

const conventionalCommitsPresetConfig = {
  types: conventionalCommitSections,
};

const hasGitHubToken = Boolean(
  process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN,
);

module.exports = {
  branches: ["main"],
  // repositoryUrl: "git@github.com:evanschoffstall/librerss.git",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        presetConfig: conventionalCommitsPresetConfig,
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        presetConfig: conventionalCommitsPresetConfig,
      },
    ],
    [
      "@semantic-release/npm",
      {
        npmPublish: false,
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["package.json"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    ...(hasGitHubToken ? ["@semantic-release/github"] : []),
  ],
};
