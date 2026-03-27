import { Monitor } from "lucide-react";
import { useEffect, useState } from "react";

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
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";

import {
  type BackgroundMode,
  MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY,
  MOBILE_TOOLBAR_MIRROR_STORAGE_KEY,
} from "../../constants";
import {
  MANUAL_REFRESH_INTERVAL_MINUTES,
  MIN_AUTO_REFRESH_INTERVAL_MINUTES,
  normalizeAutoRefreshIntervalMinutes,
} from "../../services/refresh-policy";

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
  const [mobileToolbarBottom, setMobileToolbarBottom] = useLocalStorage(
    MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY,
    true,
  );
  const [mobileToolbarMirror, setMobileToolbarMirror] = useLocalStorage(
    MOBILE_TOOLBAR_MIRROR_STORAGE_KEY,
    true,
  );
  const [autoRefreshDraft, setAutoRefreshDraft] = useState(
    String(autoRefreshIntervalMinutes),
  );

  useEffect(() => {
    setAutoRefreshDraft(String(autoRefreshIntervalMinutes));
  }, [autoRefreshIntervalMinutes]);

  const commitAutoRefreshDraft = () => {
    const parsedValue = Number.parseInt(autoRefreshDraft, 10);
    const normalizedValue = normalizeAutoRefreshIntervalMinutes(
      parsedValue,
      autoRefreshIntervalMinutes,
    );
    onAutoRefreshIntervalMinutesChange(normalizedValue);
    setAutoRefreshDraft(String(normalizedValue));
  };

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
        <div className="row-between items-start gap-4">
          <div>
            <Label htmlFor="auto-refresh-interval">Auto refresh</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Minimum {MIN_AUTO_REFRESH_INTERVAL_MINUTES} minutes. Manual
              refresh stays available every {MANUAL_REFRESH_INTERVAL_MINUTES}{" "}
              minutes.
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
        <div className="flex items-center justify-between">
          <Label htmlFor="show-favicons">Show favicons</Label>
          <Switch
            checked={showFavicons}
            id="show-favicons"
            onCheckedChange={onShowFaviconsChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="mobile-toolbar-bottom">Mobile bottom toolbar</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Move the toolbar and filter bar to the bottom on mobile.
            </p>
          </div>
          <Switch
            checked={mobileToolbarBottom}
            id="mobile-toolbar-bottom"
            onCheckedChange={setMobileToolbarBottom}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="mobile-toolbar-mirror">
              Mobile mirrored toolbar
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Reverse the toolbar element order on mobile so actions are on the
              leading edge.
            </p>
          </div>
          <Switch
            checked={mobileToolbarMirror}
            id="mobile-toolbar-mirror"
            onCheckedChange={setMobileToolbarMirror}
          />
        </div>
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
          <Select
            onValueChange={onDistillStrategyChange}
            value={distillStrategy}
          >
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
      </div>
    </section>
  );
}
