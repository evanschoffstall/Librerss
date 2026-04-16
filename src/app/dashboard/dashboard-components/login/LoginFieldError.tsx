interface LoginFieldErrorProps {
  message: string | undefined;
}

/** Inline validation error shown beneath the relevant form field group. */
export function LoginFieldError({ message }: LoginFieldErrorProps) {
  if (!message) {
    return null;
  }

  return (
    <p className="mt-1 text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}
