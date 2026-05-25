"use client";

import {
  ProxyCredentialsSection,
  ProxySectionHeader,
  ProxyUrlSection,
  SettingsProxySectionBody,
} from "@/app/dashboard/components/settings-dialog/SettingsProxySectionParts";
import {
  useSettingsProxyState,
  type UseSettingsProxyStateResult,
} from "@/app/dashboard/settings";
import { Separator } from "@/components/ui/separator";

/**
 * Describes the props for the settings proxy section component.
 */
interface SettingsProxySectionProps {
  isPreviewMode?: boolean;
}

/**
 * Describes the options for should show proxy status badges.
 */
interface ShouldShowProxyStatusBadgesOptions {
  badgeStatus: ReturnType<typeof getProxyBadgeStatus>;
  hasProxy: boolean;
  proxyRoutingCheck: UseSettingsProxyStateResult["proxyRoutingCheck"];
}

/**
 * Render the settings proxy section component.
 * @param props - The component props.
 * @returns The rendered settings proxy section component.
 */
export function SettingsProxySection(props: SettingsProxySectionProps) {
  const { isPreviewMode = false } = props;
  const proxyState = useSettingsProxyState({ enabled: !isPreviewMode });

  return <SettingsProxySectionContent {...proxyState} />;
}

/**
 * Render the settings proxy section content component.
 * @param proxyState - The proxy state.
 * @returns The rendered settings proxy section content component.
 */
export function SettingsProxySectionContent(
  proxyState: UseSettingsProxyStateResult,
) {
  const {
    error,
    handleClear,
    handleSave,
    hasProxy,
    hasProxyPassword,
    inputRef,
    proxyPassword,
    proxyRoutingCheck,
    proxyUrl,
    proxyUsername,
    saving,
    setError,
    setProxyPassword,
    setProxyUrl,
    setProxyUsername,
  } = proxyState;
  const viewState = getProxySectionViewState(proxyState);

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <ProxySectionHeader
        badgeStatus={viewState.badgeStatus}
        proxyRoutingCheck={proxyRoutingCheck}
        showStatusBadges={viewState.showStatusBadges}
        showStatusSkeletons={viewState.showStatusSkeletons}
      />
      <Separator />
      <ProxyUrlSection
        error={error}
        handleClear={handleClear}
        handleSave={handleSave}
        hasProxy={hasProxy}
        inputRef={inputRef}
        isSaveDisabled={viewState.isSaveDisabled}
        proxyUrl={proxyUrl}
        saving={saving}
        setError={setError}
        setProxyUrl={setProxyUrl}
        showProxyUrlRow={viewState.showProxyUrlRow}
      />
      <ProxyCredentialsSection
        hasProxyPassword={hasProxyPassword}
        proxyPassword={proxyPassword}
        proxyUsername={proxyUsername}
        saving={saving}
        setProxyPassword={setProxyPassword}
        setProxyUsername={setProxyUsername}
        showPasswordField={viewState.showPasswordField}
        showUsernameField={viewState.showUsernameField}
      />
      <Separator />
      <SettingsProxySectionBody proxyState={proxyState} />
    </section>
  );
}

/**
 * Return the proxy badge status.
 * @param proxyStatus - The proxy status.
 * @returns The proxy badge status.
 */
function getProxyBadgeStatus(
  proxyStatus: UseSettingsProxyStateResult["proxyStatus"],
) {
  return proxyStatus === "loading" ? null : proxyStatus;
}
/**
 * Return the proxy section view state.
 * @param options - The options used to return the proxy section view state.
 * @returns The proxy section view state.
 */
function getProxySectionViewState(
  options: Pick<
    UseSettingsProxyStateResult,
    | "hasProxy"
    | "hasProxyPassword"
    | "isInitialProxyLoadPending"
    | "proxyPassword"
    | "proxyRoutingCheck"
    | "proxyStatus"
    | "proxyUrl"
    | "proxyUsername"
    | "saving"
  >,
) {
  const {
    hasProxy,
    hasProxyPassword,
    isInitialProxyLoadPending,
    proxyPassword,
    proxyRoutingCheck,
    proxyStatus,
    proxyUrl,
    proxyUsername,
    saving,
  } = options;
  const isLoading = isInitialProxyLoadPending;
  const badgeStatus = getProxyBadgeStatus(proxyStatus);
  const showStatusBadges = shouldShowProxyStatusBadges({
    badgeStatus,
    hasProxy,
    proxyRoutingCheck,
  });

  return {
    badgeStatus,
    isSaveDisabled: saving || !proxyUrl.trim(),
    showPasswordField:
      !isLoading || hasProxyPassword || proxyPassword.length > 0,
    showProxyUrlRow: !isLoading || proxyUrl.length > 0 || hasProxy,
    showStatusBadges,
    showStatusSkeletons: isLoading && !showStatusBadges,
    showUsernameField: !isLoading || proxyUsername.length > 0,
  };
}

/**
 * Return whether should show proxy status badges.
 * @param options - The options used to return whether should show proxy status badges.
 * @returns Whether should show proxy status badges.
 */
function shouldShowProxyStatusBadges(
  options: ShouldShowProxyStatusBadgesOptions,
) {
  const { badgeStatus, hasProxy, proxyRoutingCheck } = options;
  return (
    badgeStatus !== null &&
    (badgeStatus !== "none" || proxyRoutingCheck !== null || hasProxy)
  );
}
