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
 * Describes the props for the settings icon button component.
 */
interface SettingsIconButtonProps {
  ariaLabel?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  tip: string;
}

/**
 * Render the settings icon button component.
 * @param props - The component props.
 * @returns The rendered settings icon button component.
 */
export const SettingsIconButton = (props: SettingsIconButtonProps) => {
  const { ariaLabel, children, className, disabled, onClick, tip } = props;
  return (
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
};
