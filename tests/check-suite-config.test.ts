import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

interface CheckSuiteStepImportSnapshot {
  isTypeOnly: boolean;
  namedBindings: string[];
  namespaceBinding?: string;
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
      namespaceBinding:
        namedBindings && ts.isNamespaceImport(namedBindings)
          ? namedBindings.name.text
          : undefined,
    });
  });

  return imports;
}

function readCommandPropertyValue(propertyName: string): string {
  const sourceFile = readCheckSuiteConfigSourceFile();

  for (const node of sourceFile.statements) {
    if (!ts.isVariableStatement(node)) {
      continue;
    }

    for (const declaration of node.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== "command" ||
        !declaration.initializer ||
        !ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        continue;
      }

      const property = declaration.initializer.properties.find((candidate) => {
        return (
          ts.isPropertyAssignment(candidate) &&
          getPropertyName(candidate.name) === propertyName
        );
      });

      if (
        property &&
        ts.isPropertyAssignment(property) &&
        ts.isStringLiteral(property.initializer)
      ) {
        return property.initializer.text;
      }
    }
  }

  throw new Error(`command.${propertyName} was not found.`);
}

function readPlaywrightCheckStepSnapshot(): PlaywrightCheckStepSnapshot {
  const sourceFile = readCheckSuiteConfigSourceFile();
  let snapshot: PlaywrightCheckStepSnapshot | undefined;

  sourceFile.forEachChild((node) => {
    if (
      !ts.isExportAssignment(node) ||
      !ts.isArrayLiteralExpression(node.expression)
    ) {
      return;
    }

    for (const element of node.expression.elements) {
      if (!ts.isObjectLiteralExpression(element)) {
        continue;
      }

      const keyProperty = element.properties.find((candidate) => {
        return (
          ts.isPropertyAssignment(candidate) &&
          getPropertyName(candidate.name) === "key"
        );
      });

      if (
        !keyProperty ||
        !ts.isPropertyAssignment(keyProperty) ||
        !ts.isStringLiteral(keyProperty.initializer) ||
        keyProperty.initializer.text !== "playwright"
      ) {
        continue;
      }

      const argsProperty = element.properties.find((candidate) => {
        return (
          ts.isPropertyAssignment(candidate) &&
          getPropertyName(candidate.name) === "args"
        );
      });

      if (!argsProperty || !ts.isPropertyAssignment(argsProperty)) {
        throw new Error("Playwright args property was not found.");
      }

      let args: string[] | undefined;

      if (ts.isStringLiteral(argsProperty.initializer)) {
        args = argsProperty.initializer.text.split(/\s+/u).filter(Boolean);
      } else if (
        ts.isPropertyAccessExpression(argsProperty.initializer) &&
        ts.isIdentifier(argsProperty.initializer.expression) &&
        argsProperty.initializer.expression.text === "command"
      ) {
        args = readCommandPropertyValue(argsProperty.initializer.name.text)
          .split(/\s+/u)
          .filter(Boolean);
      }

      snapshot = {
        allowSuiteFlagArgs: readBooleanProperty(element, "allowSuiteFlagArgs"),
        args,
        key: "playwright",
      };
    }
  });

  if (!snapshot) {
    throw new Error("Playwright check step entry was not found.");
  }

  return snapshot;
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
  test("imports shared step helpers through a single namespace binding", () => {
    const stepImports = readCheckSuiteStepImports();

    expect(stepImports).toEqual([
      { isTypeOnly: false, namedBindings: [], namespaceBinding: "step" },
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
