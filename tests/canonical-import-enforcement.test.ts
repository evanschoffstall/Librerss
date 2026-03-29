import { describe, expect, test } from "bun:test";
import { ESLint } from "eslint";

describe("barrel import enforcement", () => {
  test("rejects deep lib hook imports in component surfaces", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [result] = await eslint.lintText(
      'import { useLocalStorage } from "@/lib/hooks/useLocalStorage";\n\nvoid useLocalStorage;\n',
      {
        filePath: "src/components/AppThemeProvider.tsx",
      },
    );

    expect(result.errorCount).toBeGreaterThanOrEqual(1);
    expect(
      result.messages.some(
        (message) => message.ruleId === "no-restricted-imports",
      ),
    ).toBe(true);
  });

  test("rejects deep server service imports in route handlers", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [result] = await eslint.lintText(
      'import { ServerServiceError } from "@/lib/server/services";\n\nvoid ServerServiceError;\n',
      {
        filePath: "src/app/api/articles/[id]/route.ts",
      },
    );

    expect(result.errorCount).toBeGreaterThanOrEqual(1);
    expect(
      result.messages.some(
        (message) => message.ruleId === "no-restricted-imports",
      ),
    ).toBe(true);
  });
});