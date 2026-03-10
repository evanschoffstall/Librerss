import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Monitor } from "lucide-react";
import type { BackgroundMode } from "../../constants";

export interface SettingsDisplaySectionProps {
  pageSize: number;
  showFavicons: boolean;
  backgroundMode: BackgroundMode;
  onPageSizeChange: (size: number) => void;
  onShowFaviconsChange: (value: boolean) => void;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  distillStrategy: string;
  onDistillStrategyChange: (value: string) => void;
}

export function SettingsDisplaySection({
  pageSize,
  showFavicons,
  backgroundMode,
  onPageSizeChange,
  onShowFaviconsChange,
  onBackgroundModeChange,
  distillStrategy,
  onDistillStrategyChange,
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
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
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
            id="show-favicons"
            checked={showFavicons}
            onCheckedChange={onShowFaviconsChange}
          />
        </div>
        <div className="row-between">
          <Label>Background</Label>
          <Select
            value={backgroundMode}
            onValueChange={(value) =>
              onBackgroundModeChange(value as BackgroundMode)
            }
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
            value={distillStrategy}
            onValueChange={onDistillStrategyChange}
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
