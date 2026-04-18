import { Monitor } from "lucide-react";
import { useEffect, useState } from "react";

import {
  MANUAL_REFRESH_INTERVAL_MINUTES,
  MIN_AUTO_REFRESH_INTERVAL_MINUTES,
  normalizeAutoRefreshIntervalMinutes,
} from "@/app/dashboard/dashboard-services";
import {
  type BackgroundMode,
  MOBILE_INVERTED_SCROLL_STORAGE_KEY,
  MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
} from "@/app/dashboard/dashboard-services/dashboard-constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useLocalStorage } from "@/lib/hooks";

export const ARTICLES_PER_PAGE_OPTIONS = [4, 6, 8, 12] as const;

export interface SettingsDisplaySectionProps {
  articlesPerPage: number;
  autoRefreshIntervalMinutes: number;
  backgroundMode: BackgroundMode;
  distillStrategy: string;
  onArticlesPerPageChange: (value: number) => void;
  onAutoRefreshIntervalMinutesChange: (value: number) => void;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  onShowFaviconsChange: (value: boolean) => void;
  showFavicons: boolean;
}

/**
 * @param root0
 * @param root0.articlesPerPage
 * @param root0.autoRefreshIntervalMinutes
 * @param root0.backgroundMode
 * @param root0.distillStrategy
 * @param root0.onArticlesPerPageChange
 * @param root0.onAutoRefreshIntervalMinutesChange
 * @param root0.onBackgroundModeChange
 * @param root0.onDistillStrategyChange
 * @param root0.onShowFaviconsChange
 * @param root0.showFavicons
 */
export function SettingsDisplaySection({
  articlesPerPage,
  autoRefreshIntervalMinutes,
  backgroundMode,
  distillStrategy,
  onArticlesPerPageChange,
  onAutoRefreshIntervalMinutesChange,
  onBackgroundModeChange,
  onDistillStrategyChange,
  onShowFaviconsChange,
  showFavicons,
}: SettingsDisplaySectionProps) {
  const {
    autoRefreshDraft,
    commitAutoRefreshDraft,
    isMobileInvertedScrollAvailable,
    mobileGroupedLayout,
    mobileInvertedScroll,
    setAutoRefreshDraft,
    setMobileGroupedLayout,
    setMobileInvertedScroll,
  } = useDisplaySectionState(
    autoRefreshIntervalMinutes,
    onAutoRefreshIntervalMinutesChange,
  );

  return (
    <section className="settings-card">
      <div>
        <h3 className="section-heading">
          <Monitor className="icon-muted" />
          Display
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Customize how articles are displayed in the list.
        </p>
      </div>
      <div className="space-y-3">
        <AutoRefreshControl
          autoRefreshDraft={autoRefreshDraft}
          autoRefreshIntervalMinutes={autoRefreshIntervalMinutes}
          commitAutoRefreshDraft={commitAutoRefreshDraft}
          setAutoRefreshDraft={setAutoRefreshDraft}
        />
        <div className="flex items-center justify-between">
          <Label htmlFor="show-favicons">Show favicons</Label>
          <Switch
            checked={showFavicons}
            id="show-favicons"
            onCheckedChange={onShowFaviconsChange}
          />
        </div>
        <DisplayMobileToggleGroup
          isMobileInvertedScrollAvailable={isMobileInvertedScrollAvailable}
          mobileGroupedLayout={mobileGroupedLayout}
          mobileInvertedScroll={mobileInvertedScroll}
          setMobileGroupedLayout={setMobileGroupedLayout}
          setMobileInvertedScroll={setMobileInvertedScroll}
        />
        <DisplaySelectGroup
          articlesPerPage={articlesPerPage}
          backgroundMode={backgroundMode}
          distillStrategy={distillStrategy}
          onArticlesPerPageChange={onArticlesPerPageChange}
          onBackgroundModeChange={onBackgroundModeChange}
          onDistillStrategyChange={onDistillStrategyChange}
        />
      </div>
    </section>
  );
}

/**
 * @param root0
 * @param root0.autoRefreshDraft
 * @param root0.autoRefreshIntervalMinutes
 * @param root0.commitAutoRefreshDraft
 * @param root0.setAutoRefreshDraft
 */
function AutoRefreshControl({
  autoRefreshDraft,
  autoRefreshIntervalMinutes,
  commitAutoRefreshDraft,
  setAutoRefreshDraft,
}: {
  autoRefreshDraft: string;
  autoRefreshIntervalMinutes: number;
  commitAutoRefreshDraft: () => void;
  setAutoRefreshDraft: (value: string) => void;
}) {
  return (
    <div className="row-between items-start gap-4">
      <div>
        <Label htmlFor="auto-refresh-interval">Auto refresh</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Minimum {MIN_AUTO_REFRESH_INTERVAL_MINUTES} minutes. Manual refresh
          stays available every {MANUAL_REFRESH_INTERVAL_MINUTES} minutes.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          className="w-24 text-right"
          id="auto-refresh-interval"
          inputMode="numeric"
          min={MIN_AUTO_REFRESH_INTERVAL_MINUTES}
          onBlur={commitAutoRefreshDraft}
          onChange={(event) => {
            setAutoRefreshDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitAutoRefreshDraft();
            }

            if (event.key === "Escape") {
              setAutoRefreshDraft(String(autoRefreshIntervalMinutes));
            }
          }}
          step="5"
          type="number"
          value={autoRefreshDraft}
        />
        <span className="text-xs text-muted-foreground">min</span>
      </div>
    </div>
  );
}

/**
 * @param root0
 * @param root0.isMobileInvertedScrollAvailable
 * @param root0.mobileGroupedLayout
 * @param root0.mobileInvertedScroll
 * @param root0.setMobileGroupedLayout
 * @param root0.setMobileInvertedScroll
 */
function DisplayMobileToggleGroup({
  isMobileInvertedScrollAvailable,
  mobileGroupedLayout,
  mobileInvertedScroll,
  setMobileGroupedLayout,
  setMobileInvertedScroll,
}: {
  isMobileInvertedScrollAvailable: boolean;
  mobileGroupedLayout: boolean;
  mobileInvertedScroll: boolean;
  setMobileGroupedLayout: (value: boolean) => void;
  setMobileInvertedScroll: (value: boolean) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="mobile-ui-grouped-layout">
            Mobile grouped layout
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Applies mobile top toasts, mirrored toolbar alignment, and bottom
            toolbar positioning together.
          </p>
        </div>
        <Switch
          checked={mobileGroupedLayout}
          id="mobile-ui-grouped-layout"
          onCheckedChange={setMobileGroupedLayout}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="mobile-inverted-scroll">Mobile inverted scroll</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Flip the feed so newest articles anchor at the bottom and older
            content loads as you scroll up. This option is available in
            development only.
          </p>
        </div>
        <Switch
          checked={mobileInvertedScroll}
          disabled={!isMobileInvertedScrollAvailable}
          id="mobile-inverted-scroll"
          onCheckedChange={setMobileInvertedScroll}
        />
      </div>
    </>
  );
}

/**
 * @param root0
 * @param root0.articlesPerPage
 * @param root0.backgroundMode
 * @param root0.distillStrategy
 * @param root0.onArticlesPerPageChange
 * @param root0.onBackgroundModeChange
 * @param root0.onDistillStrategyChange
 */
function DisplaySelectGroup({
  articlesPerPage,
  backgroundMode,
  distillStrategy,
  onArticlesPerPageChange,
  onBackgroundModeChange,
  onDistillStrategyChange,
}: Pick<
  SettingsDisplaySectionProps,
  | "articlesPerPage"
  | "backgroundMode"
  | "distillStrategy"
  | "onArticlesPerPageChange"
  | "onBackgroundModeChange"
  | "onDistillStrategyChange"
>) {
  return (
    <>
      <div className="row-between">
        <Label>Background</Label>
        <Select
          onValueChange={(value) => {
            onBackgroundModeChange(value as BackgroundMode);
          }}
          value={backgroundMode}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select background" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="particles">Particles</SelectItem>
            <SelectItem value="stars">Stars</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="row-between">
        <Label>Articles per page</Label>
        <Select
          onValueChange={(value) => {
            onArticlesPerPageChange(Number(value));
          }}
          value={String(articlesPerPage)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select page size" />
          </SelectTrigger>
          <SelectContent>
            {ARTICLES_PER_PAGE_OPTIONS.map((pageSize) => (
              <SelectItem key={pageSize} value={String(pageSize)}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="row-between">
        <Label>Readable article mode</Label>
        <Select onValueChange={onDistillStrategyChange} value={distillStrategy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select strategy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="librerss">Librerss</SelectItem>
            <SelectItem value="readability">Readability</SelectItem>
            <SelectItem value="defuddle">Defuddle</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

/**
 * @param autoRefreshIntervalMinutes
 * @param onAutoRefreshIntervalMinutesChange
 */
function useDisplaySectionState(
  autoRefreshIntervalMinutes: number,
  onAutoRefreshIntervalMinutesChange: (value: number) => void,
) {
  const isMobileInvertedScrollAvailable =
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  const [mobileGroupedLayout, setMobileGroupedLayout] = useLocalStorage(
    MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
    true,
  );
  const [mobileInvertedScrollPreference, setMobileInvertedScrollPreference] =
    useLocalStorage(MOBILE_INVERTED_SCROLL_STORAGE_KEY, false);
  const [autoRefreshDraft, setAutoRefreshDraft] = useState(
    String(autoRefreshIntervalMinutes),
  );
  const mobileInvertedScroll = isMobileInvertedScrollAvailable
    ? mobileInvertedScrollPreference
    : false;

  useEffect(() => {
    setAutoRefreshDraft(String(autoRefreshIntervalMinutes));
  }, [autoRefreshIntervalMinutes]);

  useEffect(() => {
    if (isMobileInvertedScrollAvailable || !mobileInvertedScrollPreference) {
      return;
    }

    setMobileInvertedScrollPreference(false);
  }, [
    isMobileInvertedScrollAvailable,
    mobileInvertedScrollPreference,
    setMobileInvertedScrollPreference,
  ]);

  return {
    autoRefreshDraft,
    /**
     *
     */
    commitAutoRefreshDraft: () => {
      const parsedValue = Number.parseInt(autoRefreshDraft, 10);
      const normalizedValue = normalizeAutoRefreshIntervalMinutes(
        parsedValue,
        autoRefreshIntervalMinutes,
      );
      onAutoRefreshIntervalMinutesChange(normalizedValue);
      setAutoRefreshDraft(String(normalizedValue));
    },
    isMobileInvertedScrollAvailable,
    mobileGroupedLayout,
    mobileInvertedScroll,
    setAutoRefreshDraft,
    setMobileGroupedLayout,
    /**
     * @param value
     */
    setMobileInvertedScroll: (value: boolean) => {
      if (!isMobileInvertedScrollAvailable) {
        setMobileInvertedScrollPreference(false);
        return;
      }

      setMobileInvertedScrollPreference(value);
    },
  };
}
