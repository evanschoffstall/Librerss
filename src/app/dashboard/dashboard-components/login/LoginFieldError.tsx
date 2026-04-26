/**
 * Describes the props for the login field error component.
 */
interface LoginFieldErrorProps {
  message: string | undefined;
}

/**
 * Render the login field error component.
 * @param props - The component props.
 * @returns The rendered login field error component.
 */
export function LoginFieldError(props: LoginFieldErrorProps) {
  const { message } = props;
  if (!message) {
    return null;
  }

  return (
    <p className="mt-1 text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}
