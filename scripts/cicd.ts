/// <reference types="bun" />

import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";

const MAIN_BRANCH = "main";
const CICD_LOCK_NAME = "check-suite-cicd.lock";
type Command = readonly [string, ...string[]];
interface CommandResult {
  durationInMilliseconds: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}
interface MainBranchRevisionState {
  headRevision: string;
  remoteRevision: string;
}
type MainBranchSyncAction = "continue" | "fail" | "fast-forward";
type MainBranchSyncPhase = "post-release" | "pre-release";
type OutputMode = "capture" | "inherit";
interface ReleaseStep {
  command: Command;
  label: string;
}

/** Keep CI/CD deterministic while still prompting for explicit operator consent. */
class ReleaseWorkflowError extends Error {
  /**
   * @param message
   * @param exitCode
   */
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "ReleaseWorkflowError";
  }
}

/**
 * @param arguments_
 */
const git = (...arguments_: [string, ...string[]]): Command => [
  "git",
  ...arguments_,
];
/**
 * @param message
 */
const logRelease = (message: string): void => console.info(`[cicd] ${message}`);
/**
 * @param message
 */
const failRelease = (message: string): never => {
  logRelease(message);
  throw new ReleaseWorkflowError(message);
};

/**
 * Keep pre-release validation strict while allowing the published release commit to advance origin/main.
 * @param phase
 * @param state
 */
export function determineMainBranchSyncAction(
  phase: MainBranchSyncPhase,
  state: MainBranchRevisionState,
): MainBranchSyncAction {
  if (state.headRevision === state.remoteRevision) return "continue";
  return phase === "post-release" ? "fast-forward" : "fail";
}

/**
 * Run subprocesses in either streaming or captured mode without losing timing data.
 * @param command
 * @param outputMode
 * @param cwd
 */
async function runCommand(
  command: Command,
  outputMode: OutputMode = "inherit",
  cwd = process.cwd(),
): Promise<CommandResult> {
  const [executable, ...arguments_] = command;
  const startedAt = Date.now();
  const shouldCaptureOutput = outputMode === "capture";
  const child = Bun.spawn([executable, ...arguments_], {
    cwd,
    env: process.env,
    stderr: shouldCaptureOutput ? "pipe" : "inherit",
    stdin: shouldCaptureOutput ? "ignore" : "inherit",
    stdout: shouldCaptureOutput ? "pipe" : "inherit",
  });
  /**
   * @param stream
   */
  const readStream = async (
    stream: null | ReadableStream<Uint8Array> | undefined,
  ): Promise<string> => (stream ? await new Response(stream).text() : "");
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    shouldCaptureOutput ? readStream(child.stdout) : Promise.resolve(""),
    shouldCaptureOutput ? readStream(child.stderr) : Promise.resolve(""),
  ]);
  return {
    durationInMilliseconds: Date.now() - startedAt,
    exitCode,
    stderr,
    stdout,
  };
}

/**
 * Abort immediately on failing steps so later release stages never run on invalid state.
 * @param step
 * @param cwd
 */
async function runStepOrExit(step: ReleaseStep, cwd?: string): Promise<void> {
  logRelease(`Starting: ${step.label}`);
  const result = await runCommand(step.command, "inherit", cwd);
  if (result.exitCode !== 0) {
    logRelease(
      `Failed: ${step.label} (exit code ${result.exitCode} after ${result.durationInMilliseconds}ms)`,
    );
    throw new ReleaseWorkflowError(step.label, result.exitCode);
  }
  logRelease(`Completed: ${step.label} (${result.durationInMilliseconds}ms)`);
}

/**
 * @param command
 * @param failureLabel
 */
const runCommandForStdout = async (
  command: Command,
  failureLabel: string,
): Promise<string> => {
  const result = await runCommand(command, "capture");
  if (result.exitCode === 0) return result.stdout.trim();
  const stderr = result.stderr.trim();
  return failRelease(
    stderr.length > 0
      ? `${failureLabel}: ${stderr}`
      : `${failureLabel}: command exited with ${result.exitCode}.`,
  );
};

/**
 * Isolate staged and committed snapshots while reusing the main dependency tree.
 * @param prefix
 * @param materialize
 * @param cleanup
 * @param action
 */
async function withSnapshot<T>(
  prefix: string,
  materialize: (path: string) => Promise<void>,
  cleanup: (path: string) => Promise<void>,
  action: (path: string) => Promise<T>,
): Promise<T> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  let isMaterialized = false;
  try {
    await materialize(path);
    isMaterialized = true;
    await access(join(process.cwd(), "node_modules")).catch(() =>
      failRelease(
        "node_modules is required for staged CI/CD validation. Install dependencies before continuing.",
      ),
    );
    await symlink(
      join(process.cwd(), "node_modules"),
      join(path, "node_modules"),
      "dir",
    );
    return await action(path);
  } finally {
    await (isMaterialized
      ? cleanup(path)
      : rm(path, { force: true, recursive: true }));
  }
}

/**
 * @param question
 */
const askYesNo = async (question: string): Promise<boolean> => {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return ["y", "yes"].includes(
      (await readline.question(question)).trim().toLowerCase(),
    );
  } finally {
    readline.close();
  }
};

/**
 * @param label
 */
const getHeadRevision = async (label: string): Promise<string> =>
  await runCommandForStdout(git("rev-parse", "HEAD"), label);
/**
 * @param label
 */
const getOriginMainRevision = async (label: string): Promise<string> =>
  await runCommandForStdout(
    git("rev-parse", `refs/remotes/origin/${MAIN_BRANCH}`),
    label,
  );
/**
 *
 */
const hasPendingChanges = async (): Promise<boolean> =>
  (
    await runCommandForStdout(
      git("status", "--porcelain"),
      "Unable to inspect the git worktree",
    )
  ).length > 0;
/**
 *
 */
const hasStagedChanges = async (): Promise<boolean> =>
  (
    await runCommandForStdout(
      git("diff", "--cached", "--name-only"),
      "Unable to inspect staged release changes",
    )
  ).length > 0;
/**
 * @param label
 */
const fetchOriginMain = async (
  label = `Fetch origin/${MAIN_BRANCH}`,
): Promise<void> =>
  await runStepOrExit({ command: git("fetch", "origin", MAIN_BRANCH), label });
/**
 *
 */
const readMainBranchRevisionState =
  async (): Promise<MainBranchRevisionState> => {
    const [headRevision, remoteRevision] = await Promise.all([
      getHeadRevision("Unable to resolve local HEAD"),
      getOriginMainRevision(`Unable to resolve origin/${MAIN_BRANCH}`),
    ]);
    return { headRevision, remoteRevision };
  };
/**
 * @param state
 */
const formatMainBranchMismatch = (state: MainBranchRevisionState): string =>
  `Local HEAD (${state.headRevision}) does not match origin/${MAIN_BRANCH} (${state.remoteRevision}). Push or reconcile before continuing.`;

/**
 *
 */
async function acquireReleaseLock(): Promise<() => Promise<void>> {
  const lockDirectoryPath = join(
    process.cwd(),
    await runCommandForStdout(
      git("rev-parse", "--git-dir"),
      "Unable to resolve the git directory",
    ),
    CICD_LOCK_NAME,
  );
  const metadataPath = join(lockDirectoryPath, "metadata.json");
  /**
   *
   */
  const writeMetadata = async (): Promise<void> =>
    await writeFile(
      metadataPath,
      JSON.stringify(
        { acquiredAt: new Date().toISOString(), pid: process.pid },
        null,
        2,
      ),
      "utf8",
    );
  try {
    await mkdir(lockDirectoryPath);
  } catch (error_) {
    const isExistingLock =
      error_ instanceof Error && "code" in error_ && error_.code === "EEXIST";
    if (!isExistingLock) throw error_;
    const metadata = await readFile(metadataPath, "utf8")
      .then((text) => JSON.parse(text) as { pid?: number })
      .catch(() => undefined);
    const isStale =
      typeof metadata?.pid === "number" &&
      (() => {
        try {
          process.kill(metadata.pid, 0);
          return false;
        } catch (processError) {
          return (
            processError instanceof Error &&
            "code" in processError &&
            processError.code === "ESRCH"
          );
        }
      })();
    if (!isStale)
      failRelease(
        `Another CI/CD run already holds ${lockDirectoryPath}. Remove it only after confirming the previous process is gone.`,
      );
    await rm(lockDirectoryPath, { force: true, recursive: true });
    await mkdir(lockDirectoryPath);
    logRelease(`Recovered stale CI/CD lock at ${lockDirectoryPath}.`);
  }
  await writeMetadata();
  return async (): Promise<void> =>
    await rm(lockDirectoryPath, { force: true, recursive: true });
}

/**
 *
 */
async function commitPendingChangesIfRequested(): Promise<void> {
  if (!(await hasPendingChanges())) return;
  if (!(await hasStagedChanges()))
    failRelease(
      "Dirty worktree detected with no staged release candidate. Stage the exact release changes first so staged-only validation does not diverge from the eventual commit.",
    );
  logRelease("Pending changes detected.");
  if (
    !(await askYesNo(
      "Run gitaicmt --no-token-check -y before continuing? (y/n) ",
    ))
  )
    failRelease("CI/CD flow cancelled because the worktree is not clean.");
  await runStepOrExit({
    command: ["gitaicmt", "--no-token-check", "-y"],
    label: "Create commit with gitaicmt",
  });
}

/**
 * @param fetchLabel
 */
async function ensureHeadMatchesOriginMain(
  fetchLabel = `Fetch origin/${MAIN_BRANCH}`,
): Promise<string> {
  await fetchOriginMain(fetchLabel);
  const state = await readMainBranchRevisionState();
  if (determineMainBranchSyncAction("pre-release", state) === "fail") {
    failRelease(formatMainBranchMismatch(state));
  }
  return state.headRevision;
}

/** Guard main-branch release execution and keep origin/main synchronized with HEAD. */
async function ensureOnMainBranch(): Promise<void> {
  const branchName = await runCommandForStdout(
    git("rev-parse", "--abbrev-ref", "HEAD"),
    "Unable to determine the current branch",
  );
  if (branchName === "HEAD")
    failRelease("CI/CD flow must run from a named branch, not detached HEAD.");
  if (branchName !== MAIN_BRANCH)
    failRelease(
      `CI/CD flow must start on ${MAIN_BRANCH}. Current branch is ${branchName}.`,
    );
}

/**
 *
 */
const ensureNoStagedChangesRemain = async (): Promise<void> => {
  if (await hasStagedChanges())
    failRelease(
      "CI/CD flow still has staged changes after commit creation. Commit or unstage the remaining release candidate before continuing.",
    );
};

/**
 *
 */
const runBunCheckAgainstIndexSnapshot = async (): Promise<void> =>
  await withSnapshot(
    "check-suite-cicd-",
    async (path) =>
      await runStepOrExit({
        command: git("checkout-index", "--all", `--prefix=${path}/`),
        label: "Materialize the staged snapshot",
      }),
    async (path) => await rm(path, { force: true, recursive: true }),
    async (path) => {
      logRelease(`Running bun check in staged snapshot ${path}`);
      await runStepOrExit(
        {
          command: ["bun", "check"],
          label: "Run bun check for the staged snapshot",
        },
        path,
      );
    },
  );

/**
 * @param step
 */
const runStepAgainstHeadWorktree = async (step: ReleaseStep): Promise<void> =>
  await withSnapshot(
    "check-suite-cicd-head-",
    async (path) =>
      await runStepOrExit({
        command: git("worktree", "add", "--detach", path, "HEAD"),
        label: "Materialize the committed HEAD worktree",
      }),
    async (path) =>
      await runStepOrExit({
        command: git("worktree", "remove", "--force", path),
        label: "Remove the detached HEAD worktree",
      }),
    async (path) => {
      logRelease(`Running ${step.label} in detached HEAD worktree ${path}`);
      await runStepOrExit(step, path);
    },
  );

/** Validate the staged candidate, publish from detached HEAD, then fast-forward local main. */
async function main(): Promise<void> {
  const releaseLock = await acquireReleaseLock();
  try {
    await ensureOnMainBranch();
    await runBunCheckAgainstIndexSnapshot();
    await commitPendingChangesIfRequested();
    await ensureNoStagedChangesRemain();
    await runStepOrExit({
      command: git("push", "origin", MAIN_BRANCH),
      label: `Push ${MAIN_BRANCH} to origin`,
    });
    const releaseRevision = await ensureHeadMatchesOriginMain();
    await runStepAgainstHeadWorktree({
      command: ["bunx", "semantic-release", "--no-ci", "--dry-run"],
      label: "Run semantic-release dry-run",
    });
    logRelease("Dry-run checks completed.");
    if (!(await askYesNo("Publish the release now? (y/n) ")))
      return void logRelease("Publish step skipped by user.");
    if (
      (await getHeadRevision("Unable to resolve the current revision")) !==
      releaseRevision
    )
      failRelease(
        `HEAD changed during the CI/CD workflow (${releaseRevision} -> ${await getHeadRevision("Unable to resolve the current revision")}). Restart from a stable state.`,
      );
    await ensureHeadMatchesOriginMain();
    await runStepAgainstHeadWorktree({
      command: ["bunx", "semantic-release", "--no-ci"],
      label: "Run semantic-release",
    });
    await syncLocalMainWithOrigin();
  } finally {
    await releaseLock();
  }
}

/**
 *
 */
async function syncLocalMainWithOrigin(): Promise<void> {
  await fetchOriginMain(`Fetch origin/${MAIN_BRANCH} after release`);
  const releaseState = await readMainBranchRevisionState();
  if (
    determineMainBranchSyncAction("post-release", releaseState) === "continue"
  ) {
    logRelease(
      `Local ${MAIN_BRANCH} already includes the published release revision ${releaseState.remoteRevision}.`,
    );
    return;
  }
  if (await hasPendingChanges())
    failRelease(
      `Release was published, but the local ${MAIN_BRANCH} checkout is dirty and could not be fast-forwarded to origin/${MAIN_BRANCH}. Clean the worktree and run git pull --ff-only to pick up the release commit and version bump.`,
    );
  await runStepOrExit({
    command: git("merge", "--ff-only", `refs/remotes/origin/${MAIN_BRANCH}`),
    label: `Fast-forward local ${MAIN_BRANCH} to origin/${MAIN_BRANCH}`,
  });
  const syncedState = await readMainBranchRevisionState();
  if (
    determineMainBranchSyncAction("post-release", syncedState) !== "continue"
  ) {
    failRelease(
      `Local ${MAIN_BRANCH} still does not match origin/${MAIN_BRANCH} after the fast-forward attempt.`,
    );
  }
  logRelease(
    `Fast-forwarded local ${MAIN_BRANCH} to published release revision ${syncedState.remoteRevision}.`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error_) {
    if (error_ instanceof ReleaseWorkflowError)
      process.exitCode = error_.exitCode;
    else throw error_;
  }
}
