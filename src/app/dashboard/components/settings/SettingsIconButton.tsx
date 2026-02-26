import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const settingsDragHandleCls =
  "shrink-0 cursor-grab text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing";

export const SettingsIconButton = ({
  tip,
  onClick,
  disabled,
  children,
  className,
}: {
  tip: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className={`size-7 ${className ?? ""}`}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top">{tip}</TooltipContent>
  </Tooltip>
);
