import { KeyboardEvent } from "react";

import { LoginFieldError } from "@/app/dashboard/dashboard-components/login/LoginFieldError";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginInputFieldProps {
  error?: string;
  fieldId: string;
  label: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  placeholder: string;
  type: "email" | "password";
  value: string;
}

/**
 * @param root0
 * @param root0.error
 * @param root0.fieldId
 * @param root0.label
 * @param root0.onChange
 * @param root0.onKeyDown
 * @param root0.placeholder
 * @param root0.type
 * @param root0.value
 */
export function LoginInputField({
  error,
  fieldId,
  label,
  onChange,
  onKeyDown,
  placeholder,
  type,
  value,
}: LoginInputFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground" htmlFor={fieldId}>
        {label}
      </Label>
      <Input
        aria-invalid={Boolean(error)}
        className={error ? "border-destructive" : ""}
        id={fieldId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      <LoginFieldError message={error} />
    </div>
  );
}
