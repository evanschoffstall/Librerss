import { MotionSpinner } from "@/app/dashboard/components/status";
import { Button } from "@/components/ui/button";

/**
 * Describes the props for the settings inline editor controls component.
 */
interface SettingsInlineEditorControlsProps {
  disabled: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}
/**
 * Process the handle inline editor key down.
 * @param event - The event.
 * @param onSave - Callback invoked when the user confirms the save action.
 * @param onCancel - Callback invoked when the user cancels the action.
 */
export function handleInlineEditorKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  onSave: () => void,
  onCancel: () => void,
) {
  if (event.key === "Enter") onSave();
  if (event.key === "Escape") onCancel();
}

/**
 * Render the settings inline editor controls component.
 * @param props - The component props.
 * @returns The rendered settings inline editor controls component.
 */
export function SettingsInlineEditorControls(
  props: SettingsInlineEditorControlsProps,
) {
  const { disabled, isSaving, onCancel, onSave } = props;
  return (
    <>
      <Button
        className="h-7 text-xs"
        disabled={disabled || isSaving}
        onClick={onSave}
        size="sm"
      >
        {isSaving ? (
          <MotionSpinner className="mr-1" iconClassName="size-3" />
        ) : null}
        Save
      </Button>
      <Button
        className="h-7 text-xs"
        onClick={onCancel}
        size="sm"
        variant="ghost"
      >
        Cancel
      </Button>
    </>
  );
}
