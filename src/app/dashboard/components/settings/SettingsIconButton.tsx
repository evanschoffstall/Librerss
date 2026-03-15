import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const animTransitionColorsClass =
  "transition-colors duration-200 ease-out";

export const settingsDragHandleCls =
  "shrink-0 cursor-grab text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing";

export const SettingsIconButton = ({
  children,
  className,
  disabled,
  onClick,
  tip,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  tip: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        className={`
          size-7
          ${className ?? ""}
        `}
        disabled={disabled}
        onClick={onClick}
        size="icon"
        variant="ghost"
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top">{tip}</TooltipContent>
  </Tooltip>
);
