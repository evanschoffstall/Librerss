import type { SetStateAction } from "react";

import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

import type { UseSettingsProxyStateResult } from "@/app/dashboard/hooks/useSettingsProxyState";

import { previewText } from "@/app/dashboard/services/settings-proxy";

const proxyState = createProxyState();
const proxyEvents = createProxyEvents();

afterEach(() => {
  resetProxyState();
  resetProxyEvents();
});

describe("SettingsProxySection", () => {
  test("shows a loading skeleton until the initial proxy settings load completes", async () => {
    proxyState.proxyStatus = "loading";
    const view = await renderProxySection();

    const { container, queryByText } = view;

    expect(queryByText("Proxy URL")).toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  test("renders a configured proxy surface and runs save and clear actions", async () => {
    proxyState.hasProxy = true;
    proxyState.hasProxyPassword = true;
    proxyState.proxyRoutingCheck = {
      directIp: "198.51.100.7",
      error: null,
      proxyExitIp: "203.0.113.21",
      status: "verified",
    };
    proxyState.proxyStatus = "reachable";
    proxyState.proxyUrl = "https://proxy.example.test";
    proxyState.proxyUsername = "alice";

    const view = await renderProxySection();
    const proxyUrlInput = view.getByDisplayValue("https://proxy.example.test");
    const passwordLabel = view.getByText(/Password/);
    const buttons = view.getAllByRole("button");

    expect(view.queryByText("Connection Routing")).not.toBeNull();
    expect(view.queryByText("Connected")).not.toBeNull();
    expect(view.queryByText("Exit 203.0.113.21")).not.toBeNull();
    expect(passwordLabel.textContent ?? "").toContain("saved");

    fireEvent.click(view.getByRole("button", { name: "Save" }));
    expect(buttons[1] ?? view.container.querySelector("button")).not.toBeNull();
    fireEvent.click(buttons[1]!);

    expect(proxyEvents.handleSave).toBe(1);
    expect(proxyEvents.handleClear).toBe(1);
  });

  test("renders credential inputs and current values", async () => {
    proxyState.hasProxyPassword = true;
    proxyState.proxyPassword = "super-secret";
    proxyState.proxyUsername = "bob";

    const view = await renderProxySection();
    const textboxes = view.getAllByRole("textbox");
    const passwordInput = view.container.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement | null;

    expect((textboxes[1] as HTMLInputElement | undefined)?.value).toBe("bob");
    expect(passwordInput?.value).toBe("super-secret");
    expect(view.queryByText(/saved/)).toBeNull();
  });

  test("shows route failure instead of connected when proxied upstream checks fail", async () => {
    proxyState.hasProxy = true;
    proxyState.proxyRoutingCheck = {
      directIp: "152.208.62.191",
      error: "dial_proxy api64.ipify.org: host unreachable",
      proxyExitIp: null,
      status: "error",
    };
    proxyState.proxyStatus = "reachable";
    proxyState.proxyUrl = "socks5://proxy.example.test:1080";

    const view = await renderProxySection();

    expect(view.queryByText("Route Failed")).not.toBeNull();
    expect(view.queryByText("Connected")).toBeNull();
    expect(view.queryByText("Exit IP Unknown")).not.toBeNull();
  });

  test("renders proxy and compatibility errors with truncated previews", async () => {
    proxyState.error = "proxy ".repeat(30).trim();
    proxyState.compatibilityError = "compatibility ".repeat(20).trim();

    const view = await renderProxySection();

    expect(view.queryByText(previewText(proxyState.error))).not.toBeNull();
    expect(view.queryByText(previewText(proxyState.compatibilityError))).not.toBeNull();
  });

  test("toggles insecure TLS and runs compatibility checks", async () => {
    proxyState.hasProxy = true;
    proxyState.proxyStatus = "reachable";
    proxyState.proxyUrl = "https://proxy.example.test";
    proxyState.compatibilityCheckedAt = 60_000;
    proxyState.nowTs = 120_000;
    proxyState.compatibilityResults = [
      {
        compatibilitySignalDetected: false,
        statusCode: 200,
        success: true,
        vendor: "Direct Success",
      },
      {
        compatibilitySignalDetected: true,
        statusCode: 204,
        success: true,
        vendor: "Limited Success",
      },
      {
        compatibilitySignalDetected: false,
        error: "Socket hang up",
        statusCode: 0,
        success: false,
        vendor: "Connection Error Vendor",
      },
      {
        compatibilitySignalDetected: false,
        statusCode: 500,
        success: false,
        vendor: "Failed Vendor",
      },
    ];

    const view = await renderProxySection();

    fireEvent.click(view.getByRole("switch"));
    fireEvent.click(view.getByRole("button", { name: "Run Check" }));

    expect(view.queryByText(/via proxy/)).not.toBeNull();
    expect(view.queryByText("Last check 1m ago")).not.toBeNull();
    expect(view.queryByText("Direct Success")).not.toBeNull();
    expect(view.queryByText("Limited Success")).not.toBeNull();
    expect(view.queryByText("Connection Error Vendor")).not.toBeNull();
    expect(view.queryByText("Failed Vendor")).not.toBeNull();
    expect(view.queryByText("Passed")).not.toBeNull();
    expect(view.queryByText("Limited")).not.toBeNull();
    expect(view.queryByText("Connection Error")).not.toBeNull();
    expect(view.queryByText("Failed")).not.toBeNull();
    expect(proxyEvents.syncAllowInsecureTls).toEqual([true]);
    expect(proxyEvents.handleRunCompatibilityCheck).toBe(1);
  });

  test("shows in-progress controls while saving or checking", async () => {
    proxyState.isRunningCompatibilityCheck = true;
    proxyState.proxyStatus = "checking";
    proxyState.proxyUrl = "https://proxy.example.test";
    proxyState.saving = true;

    const view = await renderProxySection();

    const saveButton = view.getByRole("button", { name: /Save/u });
    const runCheckButton = view.getByRole("button", { name: /Checking…/u });
    const tlsSwitch = view.getByRole("switch");
    const proxyUrlInput = view.getByDisplayValue("https://proxy.example.test") as HTMLInputElement;

    expect(view.getAllByText("Checking")).toHaveLength(2);
    expect((saveButton as HTMLButtonElement).disabled).toBeTrue();
    expect((runCheckButton as HTMLButtonElement).disabled).toBeTrue();
    expect(tlsSwitch.getAttribute("data-disabled")).not.toBeNull();
    expect(proxyUrlInput.disabled).toBeTrue();
  });

});

function createProxyEvents() {
  return {
    handleClear: 0,
    handleRunCompatibilityCheck: 0,
    handleSave: 0,
    setError: [] as (null | string)[],
    setProxyPassword: [] as string[],
    setProxyUrl: [] as string[],
    setProxyUsername: [] as string[],
    syncAllowInsecureTls: [] as boolean[],
  };
}

function createProxyState(): UseSettingsProxyStateResult {
  return {
    allowInsecureTls: false,
    compatibilityCheckedAt: null,
    compatibilityError: null,
    compatibilityResults: null,
    error: null,
    handleClear: async () => {
      proxyEvents.handleClear += 1;
    },
    handleRunCompatibilityCheck: async () => {
      proxyEvents.handleRunCompatibilityCheck += 1;
    },
    handleSave: async () => {
      proxyEvents.handleSave += 1;
    },
    hasProxy: false,
    hasProxyPassword: false,
    inputRef: { current: null },
    isRunningCompatibilityCheck: false,
    nowTs: 0,
    proxyPassword: "",
    proxyRoutingCheck: null,
    proxyStatus: "none",
    proxyUrl: "",
    proxyUsername: "",
    resultsRef: { current: null },
    saving: false,
    setAllowInsecureTls: () => {},
    setError: (value: SetStateAction<null | string>) => {
      proxyEvents.setError.push(resolveStateAction(proxyState.error, value));
    },
    setProxyPassword: (value: SetStateAction<string>) => {
      proxyEvents.setProxyPassword.push(
        resolveStateAction(proxyState.proxyPassword, value),
      );
    },
    setProxyUrl: (value: SetStateAction<string>) => {
      proxyEvents.setProxyUrl.push(resolveStateAction(proxyState.proxyUrl, value));
    },
    setProxyUsername: (value: SetStateAction<string>) => {
      proxyEvents.setProxyUsername.push(
        resolveStateAction(proxyState.proxyUsername, value),
      );
    },
    syncAllowInsecureTls: async (value: boolean) => {
      proxyEvents.syncAllowInsecureTls.push(value);
    },
  };
}

async function renderProxySection() {
  const modulePath = [
    "..",
    "src",
    "app",
    "dashboard",
    "components",
    "settings",
    "SettingsProxySection.tsx",
  ].join("/");
  const { SettingsProxySectionContent } = (await import(
    `${modulePath}?settings-proxy-section-test`
  )) as typeof import("@/app/dashboard/components/settings/SettingsProxySection");

  return render(<SettingsProxySectionContent {...proxyState} />);
}

function resetProxyEvents() {
  Object.assign(proxyEvents, createProxyEvents());
}

function resetProxyState() {
  Object.assign(proxyState, createProxyState());
}

function resolveStateAction<Value>(
  currentValue: Value,
  update: SetStateAction<Value>,
) {
  return typeof update === "function"
    ? (update as (previousValue: Value) => Value)(currentValue)
    : update;
}