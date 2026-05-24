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

/**
 * Describes the props for the settings display section component.
 */
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
 * Describes the props for the auto refresh control component.
 */
interface AutoRefreshControlProps {
  autoRefreshDraft: string;
  autoRefreshIntervalMinutes: number;
  commitAutoRefreshDraft: () => void;
  setAutoRefreshDraft: (value: string) => void;
}
/**
 * Describes the props for the display mobile toggle group component.
 */
interface DisplayMobileToggleGroupProps {
  isMobileInvertedScrollAvailable: boolean;
  mobileGroupedLayout: boolean;
  mobileInvertedScroll: boolean;
  setMobileGroupedLayout: (value: boolean) => void;
  setMobileInvertedScroll: (value: boolean) => void;
}

/**
 * Render the settings display section component.
 * @param props - The component props.
 * @returns The rendered settings display section component.
 */
export function SettingsDisplaySection(props: SettingsDisplaySectionProps) {
  const {
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
  } = props;
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
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Monitor className="size-3.5 text-muted-foreground" />
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
 * Render the auto refresh control component.
 * @param props - The component props.
 * @returns The rendered auto refresh control component.
 */
function AutoRefreshControl(props: AutoRefreshControlProps) {
  const {
    autoRefreshDraft,
    autoRefreshIntervalMinutes,
    commitAutoRefreshDraft,
    setAutoRefreshDraft,
  } = props;
  return (
    <div className="flex items-start justify-between gap-4">
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
 * Render the display mobile toggle group component.
 * @param props - The component props.
 * @returns The rendered display mobile toggle group component.
 */
function DisplayMobileToggleGroup(props: DisplayMobileToggleGroupProps) {
  const {
    isMobileInvertedScrollAvailable,
    mobileGroupedLayout,
    mobileInvertedScroll,
    setMobileGroupedLayout,
    setMobileInvertedScroll,
  } = props;
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
 * Render the display select group component.
 * @param props - The component props.
 * @returns The rendered display select group component.
 */
function DisplaySelectGroup(
  props: Pick<
    SettingsDisplaySectionProps,
    | "articlesPerPage"
    | "backgroundMode"
    | "distillStrategy"
    | "onArticlesPerPageChange"
    | "onBackgroundModeChange"
    | "onDistillStrategyChange"
  >,
) {
  const {
    articlesPerPage,
    backgroundMode,
    distillStrategy,
    onArticlesPerPageChange,
    onBackgroundModeChange,
    onDistillStrategyChange,
  } = props;
  return (
    <>
      <div className="flex items-center justify-between gap-4">
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
      <div className="flex items-center justify-between gap-4">
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
      <div className="flex items-center justify-between gap-4">
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
 * Manage the display section state.
 * @param autoRefreshIntervalMinutes - The auto refresh interval minutes.
 * @param onAutoRefreshIntervalMinutesChange - Callback invoked when the auto-refresh interval setting changes.
 * @returns The display section state and callbacks.
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
     * Process the commit auto refresh draft.
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
     * Process the set mobile inverted scroll.
     * @param value - The value.
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
