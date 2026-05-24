import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let scriptImportVersion = 0;

/**
 * Loads the create-user script module with a fresh import graph.
 * @returns The isolated script module.
 */
async function loadCreateUserScript() {
  scriptImportVersion += 1;
  return import(`../scripts/db-create-user?test=${scriptImportVersion}`);
}

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("db-create-user admin prompt", () => {
  test("parseAdminPromptAnswer accepts yes/no variants and blank default", async () => {
    const { parseAdminPromptAnswer } = await loadCreateUserScript();

    expect(parseAdminPromptAnswer("yes")).toBe(true);
    expect(parseAdminPromptAnswer("Y")).toBe(true);
    expect(parseAdminPromptAnswer("no")).toBe(false);
    expect(parseAdminPromptAnswer("N")).toBe(false);
    expect(parseAdminPromptAnswer("   ")).toBe(false);
    expect(parseAdminPromptAnswer("maybe")).toBeNull();
  });

  test("promptForAdminStatus keeps asking until it receives a valid answer", async () => {
    const closeMock = mock();
    const questionMock = mock()
      .mockResolvedValueOnce("maybe")
      .mockResolvedValueOnce("y");

    mock.module("node:readline/promises", () => ({
      createInterface: () => ({
        close: closeMock,
        question: questionMock,
      }),
    }));

    const errorMock = mock(() => undefined);
    const previousConsoleError = console.error;
    console.error = errorMock;

    try {
      const { promptForAdminStatus } = await loadCreateUserScript();

      await expect(promptForAdminStatus()).resolves.toBe(true);
      expect(questionMock).toHaveBeenCalledTimes(2);
      expect(questionMock).toHaveBeenNthCalledWith(
        1,
        "Grant admin permissions to this user? [y/N]: ",
      );
      expect(errorMock).toHaveBeenCalledWith("ERROR: Please answer yes or no.");
      expect(closeMock).toHaveBeenCalledTimes(1);
    } finally {
      console.error = previousConsoleError;
    }
  });
});
