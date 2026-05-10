import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

interface CheckSuiteStepImportSnapshot {
  isTypeOnly: boolean;
  namedBindings: string[];
}

interface PlaywrightCheckStepSnapshot {
  allowSuiteFlagArgs: boolean | undefined;
  args: string[] | undefined;
  key: string;
}

function getPropertyName(propertyName: ts.PropertyName): null | string {
  if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) {
    return propertyName.text;
  }

  return null;
}

function readBooleanProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): boolean | undefined {
  const property = objectLiteral.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) &&
      getPropertyName(candidate.name) === propertyName,
  );

  if (!property || !ts.isPropertyAssignment(property)) {
    return undefined;
  }

  if (property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  throw new Error(`${propertyName} was not a boolean literal.`);
}

function readCheckSuiteConfigSourceFile(): ts.SourceFile {
  const configPath = join(process.cwd(), "check-suite.config.ts");
  return ts.createSourceFile(
    configPath,
    readFileSync(configPath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function readCheckSuiteStepImports(): CheckSuiteStepImportSnapshot[] {
  const sourceFile = readCheckSuiteConfigSourceFile();
  const imports: CheckSuiteStepImportSnapshot[] = [];

  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) {
      return;
    }

    if (
      !ts.isStringLiteral(node.moduleSpecifier) ||
      node.moduleSpecifier.text !== "check-suite/step"
    ) {
      return;
    }

    const namedBindings = node.importClause?.namedBindings;
    imports.push({
      isTypeOnly: node.importClause?.isTypeOnly === true,
      namedBindings:
        namedBindings && ts.isNamedImports(namedBindings)
          ? namedBindings.elements.map((element) => element.name.text)
          : [],
    });
  });

  return imports;
}

function readPlaywrightCheckStepSnapshot(): PlaywrightCheckStepSnapshot {
  const sourceFile = readCheckSuiteConfigSourceFile();
  let snapshot: PlaywrightCheckStepSnapshot | undefined;

  sourceFile.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) {
      return;
    }

    for (const declaration of node.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== "playwright" ||
        !declaration.initializer ||
        !ts.isCallExpression(declaration.initializer)
      ) {
        continue;
      }

      const callExpression = declaration.initializer;
      const [
        keyArgument,
        argsArgument,
        _coverageArgument,
        _defaultThresholdArgument,
        optionsArgument,
      ] = callExpression.arguments;

      if (
        !ts.isStringLiteral(keyArgument) ||
        keyArgument.text !== "playwright" ||
        !ts.isArrayLiteralExpression(argsArgument) ||
        !optionsArgument ||
        !ts.isObjectLiteralExpression(optionsArgument)
      ) {
        throw new Error(
          "Playwright check step declaration had an unexpected shape.",
        );
      }

      snapshot = {
        allowSuiteFlagArgs: readBooleanProperty(
          optionsArgument,
          "allowSuiteFlagArgs",
        ),
        args: readStringArrayExpression(argsArgument),
        key: keyArgument.text,
      };
    }
  });

  if (!snapshot) {
    throw new Error("Playwright check step declaration was not found.");
  }

  return snapshot;
}

function readStringArrayExpression(
  arrayExpression: ts.ArrayLiteralExpression,
): string[] {
  return arrayExpression.elements.map((element) => {
    if (!ts.isStringLiteral(element)) {
      throw new Error("Expected the Playwright command args to be strings.");
    }

    return element.text;
  });
}

function sourceContainsCallExpression(calleeName: string): boolean {
  const sourceFile = readCheckSuiteConfigSourceFile();
  let found = false;

  /** Walks the parsed config until the requested call expression is found. */
  function visit(node: ts.Node): void {
    if (found) {
      return;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === calleeName
    ) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

describe("check-suite config", () => {
  test("keeps the heavy step runtime out of config-time imports", () => {
    const stepImports = readCheckSuiteStepImports();

    // `check-suite/step` currently loads runtime-only lint machinery at import
    // time. A value import here makes even `bun check keys` and `bun check
    // --madge` wait on unrelated setup before selected steps can start.
    expect(stepImports).toEqual([
      { isTypeOnly: true, namedBindings: ["GitFileScanOptions"] },
    ]);
  });

  test("does not scan repository roots while loading the config", () => {
    expect(sourceContainsCallExpression("discoverDefaultCodeRoots")).toBe(
      false,
    );
  });

  test("allows the Playwright suite flag to forward focused test file arguments", () => {
    const playwrightStep = readPlaywrightCheckStepSnapshot();

    expect(playwrightStep.allowSuiteFlagArgs).toBe(true);
    expect(playwrightStep.args).toEqual(["run", "test:e2e:coverage"]);
  });
});
