import { Monitor } from "lucide-react";
import { useEffect, useState } from "react";

import type { BackgroundMode } from "../../constants";
import {
  MANUAL_REFRESH_INTERVAL_MINUTES,
  MIN_AUTO_REFRESH_INTERVAL_MINUTES,
  normalizeAutoRefreshIntervalMinutes,
} from "../../services/refresh-policy";

import { ARTICLE_PAGE_SIZE_OPTIONS } from "@/app/dashboard/services/page-size";
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

export interface SettingsDisplaySectionProps {
  autoRefreshIntervalMinutes: number;
  backgroundMode: BackgroundMode;
  distillStrategy: string;
  onAutoRefreshIntervalMinutesChange: (value: number) => void;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  onPageSizeChange: (size: number) => void;
  onShowFaviconsChange: (value: boolean) => void;
  pageSize: number;
  showFavicons: boolean;
}

export function SettingsDisplaySection({
  autoRefreshIntervalMinutes,
  backgroundMode,
  distillStrategy,
  onAutoRefreshIntervalMinutesChange,
  onBackgroundModeChange,
  onDistillStrategyChange,
  onPageSizeChange,
  onShowFaviconsChange,
  pageSize,
  showFavicons,
}: SettingsDisplaySectionProps) {
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
        <div className="row-between">
          <Label>Items per page</Label>
          <Select
            onValueChange={(v) => {
              onPageSizeChange(Number(v));
            }}
            value={String(pageSize)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select amount" />
            </SelectTrigger>
            <SelectContent>
              {ARTICLE_PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} articles
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
          <Label>Content extraction</Label>
          <Select
            onValueChange={onDistillStrategyChange}
            value={distillStrategy}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom (built-in)</SelectItem>
              <SelectItem value="readability">Readability</SelectItem>
              <SelectItem value="defuddle">Defuddle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}
