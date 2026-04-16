import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import { Button } from "@/components/ui/button";

export function handleInlineEditorKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  onSave: () => void,
  onCancel: () => void,
) {
  if (event.key === "Enter") onSave();
  if (event.key === "Escape") onCancel();
}

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
