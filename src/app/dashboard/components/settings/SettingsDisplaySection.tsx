import { Monitor } from "lucide-react";

import type { BackgroundMode } from "../../constants";

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
  backgroundMode: BackgroundMode;
  distillStrategy: string;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  onPageSizeChange: (size: number) => void;
  onShowFaviconsChange: (value: boolean) => void;
  pageSize: number;
  showFavicons: boolean;
}

export function SettingsDisplaySection({
  backgroundMode,
  distillStrategy,
  onBackgroundModeChange,
  onDistillStrategyChange,
  onPageSizeChange,
  onShowFaviconsChange,
  pageSize,
  showFavicons,
}: SettingsDisplaySectionProps) {
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
              <SelectItem value="10">10 articles</SelectItem>
              <SelectItem value="25">25 articles</SelectItem>
              <SelectItem value="50">50 articles</SelectItem>
            </SelectContent>
          </Select>
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
