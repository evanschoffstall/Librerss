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
   * Creates a workflow error with an explicit process exit code.
   * @param message - Operator-facing failure message for the aborted release step.
   * @param exitCode - Process exit code that should be returned to the shell.
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
 * Process the git.
 * @param arguments_ - The arguments.
 * @returns The git.
 */
const git = (...arguments_: [string, ...string[]]): Command => [
  "git",
  ...arguments_,
];
/**
 * Writes a release workflow log line with the standard prefix.
 * @param message - The message.
 * @returns Nothing.
 */
const logRelease = (message: string): void => console.info(`[cicd] ${message}`);
/**
 * Aborts the release workflow with a logged failure message.
 * @param message - The message.
 */
const failRelease = (message: string): never => {
  logRelease(message);
  throw new ReleaseWorkflowError(message);
};

/**
 * Process the determine main branch sync action.
 * @param phase - The phase.
 * @param state - The state.
 * @returns The determine main branch sync action.
 */
export function determineMainBranchSyncAction(
  phase: MainBranchSyncPhase,
  state: MainBranchRevisionState,
): MainBranchSyncAction {
  if (state.headRevision === state.remoteRevision) return "continue";
  return phase === "post-release" ? "fast-forward" : "fail";
}

/**
 * Process the run command.
 * @param command - The command.
 * @param outputMode - The output mode.
 * @param cwd - The cwd.
 * @returns The run command.
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
   * Process the read stream.
   * @param stream - The stream.
   * @returns The read stream.
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
 * Process the run step or exit.
 * @param step - The step.
 * @param cwd - The cwd.
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
 * Process the run command for stdout.
 * @param command - The command.
 * @param failureLabel - The failure label.
 * @returns The run command for stdout.
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
 * Process the with snapshot.
 * @param prefix - The prefix.
 * @param materialize - The callback that materialize.
 * @param cleanup - The callback that cleanup.
 * @param action - The callback that action.
 * @returns The with snapshot.
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
 * Process the ask yes no.
 * @param question - The question.
 * @returns The ask yes no.
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
 * Return the head revision.
 * @param label - The label.
 * @returns The head revision.
 */
const getHeadRevision = async (label: string): Promise<string> =>
  await runCommandForStdout(git("rev-parse", "HEAD"), label);
/**
 * Return the origin main revision.
 * @param label - The label.
 * @returns The origin main revision.
 */
const getOriginMainRevision = async (label: string): Promise<string> =>
  await runCommandForStdout(
    git("rev-parse", `refs/remotes/origin/${MAIN_BRANCH}`),
    label,
  );
/**
 * Return whether has pending changes.
 * @returns Whether has pending changes.
 */
const hasPendingChanges = async (): Promise<boolean> =>
  (
    await runCommandForStdout(
      git("status", "--porcelain"),
      "Unable to inspect the git worktree",
    )
  ).length > 0;
/**
 * Return whether has staged changes.
 * @returns Whether has staged changes.
 */
const hasStagedChanges = async (): Promise<boolean> =>
  (
    await runCommandForStdout(
      git("diff", "--cached", "--name-only"),
      "Unable to inspect staged release changes",
    )
  ).length > 0;
/**
 * Fetches the latest revision for the remote main branch.
 * @param label - The label.
 * @returns A promise that resolves once the fetch step finishes.
 */
const fetchOriginMain = async (
  label = `Fetch origin/${MAIN_BRANCH}`,
): Promise<void> =>
  await runStepOrExit({ command: git("fetch", "origin", MAIN_BRANCH), label });
/**
 * Process the read main branch revision state.
 * @returns The read main branch revision state.
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
 * Process the format main branch mismatch.
 * @param state - The state.
 * @returns The format main branch mismatch.
 */
const formatMainBranchMismatch = (state: MainBranchRevisionState): string =>
  `Local HEAD (${state.headRevision}) does not match origin/${MAIN_BRANCH} (${state.remoteRevision}). Push or reconcile before continuing.`;

/**
 * Process the acquire release lock.
 * @returns The acquire release lock.
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
   * Persists lock ownership metadata for stale-lock recovery.
   * @returns A promise that resolves once the metadata file is written.
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
 * Process the commit pending changes if requested.
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
 * Process the ensure head matches origin main.
 * @param fetchLabel - The fetch label.
 * @returns The ensure head matches origin main.
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

/**
 * Process the ensure on main branch.
 */
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
 * Process the ensure no staged changes remain.
 */
const ensureNoStagedChangesRemain = async (): Promise<void> => {
  if (await hasStagedChanges())
    failRelease(
      "CI/CD flow still has staged changes after commit creation. Commit or unstage the remaining release candidate before continuing.",
    );
};

/**
 * Runs the full Bun check suite against the staged index snapshot.
 * @returns A promise that resolves once staged validation completes.
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
 * Runs a release step inside a detached worktree materialized from HEAD.
 * @param step - The step.
 * @returns A promise that resolves once the detached worktree step finishes.
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

/**
 * Executes the interactive release workflow from validation through publish.
 * @returns A promise that resolves once the workflow finishes or is skipped.
 */
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
 * Process the sync local main with origin.
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
