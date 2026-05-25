#!/usr/bin/env bun

/**
 * Refactors the dashboard feature tree to the repository's folder-owned pattern.
 *
 * Default mode is a dry run that prints the planned file moves, tsconfig path
 * alias updates, and API route index deletions without changing the workspace.
 * Pass `--write` to apply the plan.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { Project, type SourceFile, SyntaxKind } from "ts-morph";

/**
 * Captures one deleted API route `index.ts` file and the route import path that
 * must be rewritten to the remaining `route.ts` owner.
 */
interface PlannedApiRouteIndexDeletion {
  routeImportSpecifier: string;
  sourceFile: SourceFile;
}

/**
 * Describes a single source file move from its current absolute path to the
 * normalized dashboard feature destination.
 */
interface PlannedMove {
  sourceFile: SourceFile;
  targetPath: string;
}

const SHOULD_WRITE = process.argv.includes("--write");
const REPO_ROOT = resolve(import.meta.dir, "..");
const TSCONFIG_PATH = resolve(REPO_ROOT, "tsconfig.json");

const exactFileMoves = new Map<string, string>([
  [
    resolve(REPO_ROOT, "src/app/dashboard/dashboard-router/router.tsx"),
    resolve(REPO_ROOT, "src/app/dashboard/router/DashboardRouter.tsx"),
  ],
  [
    resolve(REPO_ROOT, "src/app/dashboard/dashboard-router/surfaces.tsx"),
    resolve(REPO_ROOT, "src/app/dashboard/router/DashboardRouterSurfaces.tsx"),
  ],
  [
    resolve(REPO_ROOT, "src/app/dashboard/dashboard-view/settings-modal.tsx"),
    resolve(REPO_ROOT, "src/app/dashboard/view/DashboardSettingsModal.tsx"),
  ],
  [
    resolve(REPO_ROOT, "src/app/dashboard/dashboard-view/view.tsx"),
    resolve(REPO_ROOT, "src/app/dashboard/view/DashboardView.tsx"),
  ],
  [
    resolve(REPO_ROOT, "src/public.ts"),
    resolve(REPO_ROOT, "src/public/index.ts"),
  ],
]);

const folderMoves = [
  [
    resolve(REPO_ROOT, "src/app/dashboard/dashboard-components"),
    resolve(REPO_ROOT, "src/app/dashboard/components"),
  ],
  [
    resolve(REPO_ROOT, "src/app/dashboard/dashboard-hooks"),
    resolve(REPO_ROOT, "src/app/dashboard/hooks"),
  ],
  [
    resolve(REPO_ROOT, "src/app/dashboard/dashboard-services"),
    resolve(REPO_ROOT, "src/app/dashboard/services"),
  ],
  [
    resolve(REPO_ROOT, "src/app/dashboard/dashboard-router"),
    resolve(REPO_ROOT, "src/app/dashboard/router"),
  ],
  [
    resolve(REPO_ROOT, "src/app/dashboard/dashboard-view"),
    resolve(REPO_ROOT, "src/app/dashboard/view"),
  ],
  [
    resolve(REPO_ROOT, "src/app/dashboard/settings-state"),
    resolve(REPO_ROOT, "src/app/dashboard/settings"),
  ],
  [
    resolve(REPO_ROOT, "src/app/dashboard/preview-mode"),
    resolve(REPO_ROOT, "src/app/dashboard/preview"),
  ],
  [
    resolve(REPO_ROOT, "src/app/dashboard/page-bootstrap"),
    resolve(REPO_ROOT, "src/app/dashboard/bootstrap"),
  ],
] as const;

const moduleSpecifierPrefixRewrites = [
  ["@/app/dashboard/components", "@/app/dashboard/components"],
  ["@/app/dashboard/hooks", "@/app/dashboard/hooks"],
  ["@/app/dashboard/services", "@/app/dashboard/services"],
  ["@/app/dashboard/router", "@/app/dashboard/router"],
  ["@/app/dashboard/view", "@/app/dashboard/view"],
  ["@/app/dashboard/settings", "@/app/dashboard/settings"],
  ["@/app/dashboard/preview", "@/app/dashboard/preview"],
  ["@/app/dashboard/bootstrap", "@/app/dashboard/bootstrap"],
] as const;

const exactModuleSpecifierRewrites = new Map<string, string>([
  [
    "@/app/dashboard/router/DashboardRouter",
    "@/app/dashboard/router/DashboardRouter",
  ],
  [
    "@/app/dashboard/router/DashboardRouter",
    "@/app/dashboard/router/DashboardRouter",
  ],
  [
    "@/app/dashboard/router/DashboardRouterSurfaces",
    "@/app/dashboard/router/DashboardRouterSurfaces",
  ],
  [
    "@/app/dashboard/router/DashboardRouterSurfaces",
    "@/app/dashboard/router/DashboardRouterSurfaces",
  ],
  [
    "@/app/dashboard/view/DashboardSettingsModal",
    "@/app/dashboard/view/DashboardSettingsModal",
  ],
  [
    "@/app/dashboard/view/DashboardSettingsModal",
    "@/app/dashboard/view/DashboardSettingsModal",
  ],
  [
    "@/app/dashboard/view/DashboardView",
    "@/app/dashboard/view/DashboardView",
  ],
  [
    "@/app/dashboard/view/DashboardView",
    "@/app/dashboard/view/DashboardView",
  ],
  ["@/public", "@/public"],
]);

/**
 * Rewrite tsconfig path targets so repository aliases keep pointing at the new
 * folder layout after the move plan is applied.
 *
 * @returns A formatted JSON string when tsconfig changed, otherwise `null`.
 */
function buildUpdatedTsconfigText(): null | string {
  const originalText = readFileSync(TSCONFIG_PATH, "utf8");
  const tsconfig = JSON.parse(originalText) as {
    compilerOptions?: {
      paths?: Record<string, string[]>;
    };
  };
  const paths = tsconfig.compilerOptions?.paths;

  if (!paths) {
    return null;
  }

  let didChange = false;

  for (const [aliasKey, pathTargets] of Object.entries(paths)) {
    paths[aliasKey] = pathTargets.map((pathTarget) => {
      const normalizedAbsolutePath = resolve(REPO_ROOT, pathTarget);
      const movedAbsolutePath = resolveMovedPath(normalizedAbsolutePath);

      if (movedAbsolutePath === normalizedAbsolutePath) {
        return pathTarget;
      }

      didChange = true;
      const rewrittenTarget = relative(REPO_ROOT, movedAbsolutePath).replaceAll(
        "\\",
        "/",
      );

      return rewrittenTarget.startsWith(".") ? rewrittenTarget : `./${rewrittenTarget}`;
    });
  }

  if (!didChange) {
    return null;
  }

  return `${JSON.stringify(tsconfig, null, 2)}\n`;
}

/**
 * Find route-directory index files that violate the repo rule requiring only
 * `route.ts` inside `src/app/api/**` route folders.
 *
 * @param project - Active ts-morph project.
 * @returns The route-index files scheduled for import rewrites and deletion.
 */
function collectApiRouteIndexDeletions(
  project: Project,
): PlannedApiRouteIndexDeletion[] {
  return project
    .getSourceFiles()
    .filter((sourceFile) => {
      const filePath = sourceFile.getFilePath().replaceAll("\\", "/");

      return (
        filePath.startsWith(`${resolve(REPO_ROOT, "src/app/api").replaceAll("\\", "/")}/`) &&
        filePath.endsWith("/index.ts")
      );
    })
    .map((sourceFile) => {
      const relativeDirectory = relative(
        resolve(REPO_ROOT, "src"),
        dirname(sourceFile.getFilePath()),
      ).replaceAll("\\", "/");

      return {
        routeImportSpecifier: `@/${relativeDirectory}`,
        sourceFile,
      };
    })
    .sort((left, right) =>
      left.sourceFile.getFilePath().localeCompare(right.sourceFile.getFilePath()),
    );
}

/**
 * Build the list of source-file moves that express the normalized dashboard tree.
 *
 * @param project - Active ts-morph project.
 * @returns Planned source-file moves in deterministic path order.
 */
function collectPlannedMoves(project: Project): PlannedMove[] {
  return project
    .getSourceFiles()
    .map((sourceFile) => ({
      sourceFile,
      targetPath: resolveMovedPath(sourceFile.getFilePath()),
    }))
    .filter(({ sourceFile, targetPath }) => sourceFile.getFilePath() !== targetPath)
    .sort((left, right) =>
      left.sourceFile.getFilePath().localeCompare(right.sourceFile.getFilePath()),
    );
}

/**
 * Print the exact mutation plan so move mappings can be spot-checked before any
 * write-enabled run changes files.
 *
 * @param plannedMoves - Planned source file moves.
 * @param plannedDeletions - Planned API route index deletions.
 * @param hasTsconfigUpdate - Whether tsconfig path aliases will change.
 */
function printPlan(
  plannedMoves: PlannedMove[],
  plannedDeletions: PlannedApiRouteIndexDeletion[],
  hasTsconfigUpdate: boolean,
): void {
  console.log(`mode=${SHOULD_WRITE ? "write" : "dry-run"}`);
  console.log(`plannedMoves=${plannedMoves.length}`);

  if (!SHOULD_WRITE) {
    for (const { sourceFile, targetPath } of plannedMoves) {
      console.log(
        `move ${relative(REPO_ROOT, sourceFile.getFilePath())} -> ${relative(REPO_ROOT, targetPath)}`,
      );
    }
  }

  console.log(`plannedApiRouteIndexDeletions=${plannedDeletions.length}`);

  if (!SHOULD_WRITE) {
    for (const { sourceFile } of plannedDeletions) {
      console.log(`delete ${relative(REPO_ROOT, sourceFile.getFilePath())}`);
    }
  }

  console.log(`tsconfigPathsUpdate=${hasTsconfigUpdate}`);
}

/**
 * Resolve a moved path by applying exact file moves before broader folder moves.
 *
 * @param absolutePath - Current absolute file path.
 * @returns The rewritten absolute path, or the original path when no move applies.
 */
function resolveMovedPath(absolutePath: string): string {
  const exactMoveTarget = exactFileMoves.get(absolutePath);

  if (exactMoveTarget) {
    return exactMoveTarget;
  }

  for (const [oldPrefix, newPrefix] of folderMoves) {
    if (absolutePath === oldPrefix || absolutePath.startsWith(`${oldPrefix}/`)) {
      return absolutePath.replace(oldPrefix, newPrefix);
    }
  }

  return absolutePath;
}

/**
 * Update import declarations that still point at route-folder `index.ts`
 * re-exports so those re-export files can be removed cleanly.
 *
 * @param project - Active ts-morph project.
 * @param plannedDeletions - Route-index files scheduled for deletion.
 */
function rewriteApiRouteImports(
  project: Project,
  plannedDeletions: PlannedApiRouteIndexDeletion[],
): void {
  const importRewriteMap = new Map(
    plannedDeletions.map(({ routeImportSpecifier }) => [
      routeImportSpecifier,
      `${routeImportSpecifier}/route`,
    ]),
  );

  for (const sourceFile of project.getSourceFiles()) {
    for (const importDeclaration of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
      const rewrittenSpecifier = importRewriteMap.get(moduleSpecifier);

      if (!rewrittenSpecifier) {
        continue;
      }

      importDeclaration.setModuleSpecifier(rewrittenSpecifier);
    }
  }
}

/**
 * Rewrite old dashboard module specifiers that are not updated automatically by
 * ts-morph when the repository imports through custom path aliases or dynamic
 * import strings.
 *
 * @param project - Active ts-morph project.
 */
function rewriteDashboardModuleSpecifiers(project: Project): void {
  for (const sourceFile of project.getSourceFiles()) {
    for (const importDeclaration of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
      const rewrittenSpecifier = rewriteModuleSpecifier(moduleSpecifier);

      if (rewrittenSpecifier !== moduleSpecifier) {
        importDeclaration.setModuleSpecifier(rewrittenSpecifier);
      }
    }

    for (const exportDeclaration of sourceFile.getExportDeclarations()) {
      const moduleSpecifier = exportDeclaration.getModuleSpecifierValue();

      if (!moduleSpecifier) {
        continue;
      }

      const rewrittenSpecifier = rewriteModuleSpecifier(moduleSpecifier);

      if (rewrittenSpecifier !== moduleSpecifier) {
        exportDeclaration.setModuleSpecifier(rewrittenSpecifier);
      }
    }

    for (const stringLiteral of sourceFile.getDescendantsOfKind(
      SyntaxKind.StringLiteral,
    )) {
      const literalValue = stringLiteral.getLiteralValue();
      const rewrittenSpecifier = rewriteModuleSpecifier(literalValue);

      if (rewrittenSpecifier === literalValue) {
        continue;
      }

      stringLiteral.setLiteralValue(rewrittenSpecifier);
    }

    for (const noSubstitutionTemplateLiteral of sourceFile.getDescendantsOfKind(
      SyntaxKind.NoSubstitutionTemplateLiteral,
    )) {
      const literalValue = noSubstitutionTemplateLiteral.getLiteralValue();
      const rewrittenSpecifier = rewriteModuleSpecifier(literalValue);

      if (rewrittenSpecifier === literalValue) {
        continue;
      }

      noSubstitutionTemplateLiteral.replaceWithText(`\`${rewrittenSpecifier}\``);
    }

    for (const templateExpression of sourceFile.getDescendantsOfKind(
      SyntaxKind.TemplateExpression,
    )) {
      const templateHead = templateExpression.getHead();
      const headText = templateHead.getLiteralText();
      const rewrittenHeadText = rewriteModuleSpecifier(headText);

      if (rewrittenHeadText === headText) {
        continue;
      }

      templateHead.replaceWithText(`\`${rewrittenHeadText}`);
    }
  }
}

/**
 * Rewrite a module specifier string from the old dashboard tree to the new one.
 *
 * @param moduleSpecifier - Original module specifier text.
 * @returns Rewritten module specifier text.
 */
function rewriteModuleSpecifier(moduleSpecifier: string): string {
  const exactRewrite = exactModuleSpecifierRewrites.get(moduleSpecifier);

  if (exactRewrite) {
    return exactRewrite;
  }

  for (const [oldPrefix, newPrefix] of moduleSpecifierPrefixRewrites) {
    if (
      moduleSpecifier === oldPrefix ||
      moduleSpecifier.startsWith(`${oldPrefix}/`)
    ) {
      return moduleSpecifier.replace(oldPrefix, newPrefix);
    }
  }

  return moduleSpecifier;
}

const project = new Project({
  skipAddingFilesFromTsConfig: false,
  tsConfigFilePath: TSCONFIG_PATH,
});

const plannedMoves = collectPlannedMoves(project);
const plannedDeletions = collectApiRouteIndexDeletions(project);
const updatedTsconfigText = buildUpdatedTsconfigText();

printPlan(plannedMoves, plannedDeletions, updatedTsconfigText !== null);

if (!SHOULD_WRITE) {
  process.exit(0);
}

rewriteApiRouteImports(project, plannedDeletions);
rewriteDashboardModuleSpecifiers(project);

console.log("phase=imports-rewritten");

for (const [moveIndex, { sourceFile, targetPath }] of plannedMoves.entries()) {
  const targetDirectory = dirname(targetPath);

  if (!existsSync(targetDirectory)) {
    const existingDirectory = sourceFile.getProject().getDirectory(targetDirectory);

    if (existingDirectory === undefined) {
      sourceFile.getProject().createDirectory(targetDirectory);
    }
  }

  sourceFile.move(targetPath);

  if ((moveIndex + 1) % 25 === 0 || moveIndex === plannedMoves.length - 1) {
    console.log(`phase=moves-applied progress=${moveIndex + 1}/${plannedMoves.length}`);
  }
}

for (const { sourceFile } of plannedDeletions) {
  sourceFile.delete();
}

console.log(`phase=route-indexes-deleted count=${plannedDeletions.length}`);

if (updatedTsconfigText) {
  writeFileSync(TSCONFIG_PATH, updatedTsconfigText);
  console.log("phase=tsconfig-updated");
}

await project.save();
console.log("phase=project-saved");