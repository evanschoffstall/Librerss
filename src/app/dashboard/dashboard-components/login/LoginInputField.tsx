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
 * Render the login input field component.
 * @param props - The component props.
 * @returns The rendered login input field component.
 */
export function LoginInputField(props: LoginInputFieldProps) {
  const {
    error,
    fieldId,
    label,
    onChange,
    onKeyDown,
    placeholder,
    type,
    value,
  } = props;
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
