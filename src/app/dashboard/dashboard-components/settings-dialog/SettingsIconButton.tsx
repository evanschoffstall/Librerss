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

/**
 * @param root0
 * @param root0.ariaLabel
 * @param root0.children
 * @param root0.className
 * @param root0.disabled
 * @param root0.onClick
 * @param root0.tip
 */
export const SettingsIconButton = ({
  ariaLabel,
  children,
  className,
  disabled,
  onClick,
  tip,
}: {
  ariaLabel?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  tip: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        aria-label={ariaLabel ?? tip}
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
