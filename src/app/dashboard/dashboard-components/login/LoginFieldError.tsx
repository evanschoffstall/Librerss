interface LoginFieldErrorProps {
  message: string | undefined;
}

/**
 * Inline validation error shown beneath the relevant form field group.
 * @param root0
 * @param root0.message
 */
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
