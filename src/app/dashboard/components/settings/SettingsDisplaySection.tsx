import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface SettingsDisplaySectionProps {
  pageSize: number;
  showFavicons: boolean;
  showParticlesBackground: boolean;
  onPageSizeChange: (size: number) => void;
  onShowFaviconsChange: (value: boolean) => void;
  onShowParticlesBackgroundChange: (value: boolean) => void;
}

export function SettingsDisplaySection({
  pageSize,
  showFavicons,
  showParticlesBackground,
  onPageSizeChange,
  onShowFaviconsChange,
  onShowParticlesBackgroundChange,
}: SettingsDisplaySectionProps) {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-4">
      <div>
        <h3 className="font-semibold">Display</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Customize how articles are displayed in the list.
        </p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="auto-refresh">Auto-refresh</Label>
          <Switch id="auto-refresh" defaultChecked />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label>Items per page</Label>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
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
        <div className="flex items-center justify-between">
          <Label htmlFor="show-particles-background">Particles background</Label>
          <Switch
            id="show-particles-background"
            checked={showParticlesBackground}
            onCheckedChange={onShowParticlesBackgroundChange}
          />
        </div>
      </div>
    </section>
  );
}
