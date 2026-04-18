import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import { Button } from "@/components/ui/button";

/**
 * @param event
 * @param onSave
 * @param onCancel
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
 * @param root0
 * @param root0.disabled
 * @param root0.isSaving
 * @param root0.onCancel
 * @param root0.onSave
 */
export function SettingsInlineEditorControls({
  disabled,
  isSaving,
  onCancel,
  onSave,
}: {
  disabled: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
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
