"use client";

import {
  ProxyCredentialsSection,
  ProxySectionHeader,
  ProxyTlsToggle,
  ProxyUrlSection,
  SettingsProxySectionBody,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsProxySectionParts";
import {
  useSettingsProxyState,
  type UseSettingsProxyStateResult,
} from "@/app/dashboard/settings-state";
import { Separator } from "@/components/ui/separator";

/**
 * @param root0
 * @param root0.isPreviewMode
 */
export function SettingsProxySection({
  isPreviewMode = false,
}: {
  isPreviewMode?: boolean;
}) {
  const proxyState = useSettingsProxyState({ enabled: !isPreviewMode });

  return <SettingsProxySectionContent {...proxyState} />;
}

/**
 * Renders the proxy settings surface from an already-owned proxy state model.
 * @param proxyState
 */
export function SettingsProxySectionContent(
  proxyState: UseSettingsProxyStateResult,
) {
  const {
    allowInsecureTls,
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
    syncAllowInsecureTls,
  } = proxyState;
  const viewState = getProxySectionViewState(proxyState);

  return (
    <section className="settings-card">
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
      <ProxyTlsToggle
        allowInsecureTls={allowInsecureTls}
        saving={saving}
        showTlsToggle={viewState.showTlsToggle}
        syncAllowInsecureTls={syncAllowInsecureTls}
      />
      <Separator />
      <Separator />
      <SettingsProxySectionBody proxyState={proxyState} />
    </section>
  );
}

/**
 * @param proxyStatus
 */
function getProxyBadgeStatus(
  proxyStatus: UseSettingsProxyStateResult["proxyStatus"],
) {
  return proxyStatus === "loading" ? null : proxyStatus;
}

/**
 * @param root0
 * @param root0.hasProxy
 * @param root0.hasProxyPassword
 * @param root0.isInitialProxyLoadPending
 * @param root0.proxyPassword
 * @param root0.proxyRoutingCheck
 * @param root0.proxyStatus
 * @param root0.proxyUrl
 * @param root0.proxyUsername
 * @param root0.saving
 */
function getProxySectionViewState({
  hasProxy,
  hasProxyPassword,
  isInitialProxyLoadPending,
  proxyPassword,
  proxyRoutingCheck,
  proxyStatus,
  proxyUrl,
  proxyUsername,
  saving,
}: Pick<
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
>) {
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
    showTlsToggle: !isLoading || hasProxy,
    showUsernameField: !isLoading || proxyUsername.length > 0,
  };
}

/**
 * @param root0
 * @param root0.badgeStatus
 * @param root0.hasProxy
 * @param root0.proxyRoutingCheck
 */
function shouldShowProxyStatusBadges({
  badgeStatus,
  hasProxy,
  proxyRoutingCheck,
}: {
  badgeStatus: ReturnType<typeof getProxyBadgeStatus>;
  hasProxy: boolean;
  proxyRoutingCheck: UseSettingsProxyStateResult["proxyRoutingCheck"];
}) {
  return (
    badgeStatus !== null &&
    (badgeStatus !== "none" || proxyRoutingCheck !== null || hasProxy)
  );
}
