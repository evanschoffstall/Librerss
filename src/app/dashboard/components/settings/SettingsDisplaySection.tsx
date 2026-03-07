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

interface SettingsDisplaySectionProps {
  pageSize: number;
  showFavicons: boolean;
  backgroundMode: BackgroundMode;
  onPageSizeChange: (size: number) => void;
  onShowFaviconsChange: (value: boolean) => void;
  onBackgroundModeChange: (value: BackgroundMode) => void;
}

export function SettingsDisplaySection({
  pageSize,
  showFavicons,
  backgroundMode,
  onPageSizeChange,
  onShowFaviconsChange,
  onBackgroundModeChange,
}: SettingsDisplaySectionProps) {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-4">
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
        <div className="flex items-center justify-between gap-4">
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
        <div className="flex items-center justify-between gap-4">
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
      </div>
    </section>
  );
}
