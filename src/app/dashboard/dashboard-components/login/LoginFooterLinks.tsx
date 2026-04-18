import Link from "next/link";

/**
 * Render the login footer links component.
 * @returns The rendered login footer links component.
 */
export function LoginFooterLinks() {
  return (
    <div
      className="
        flex items-center justify-center gap-4 text-xs text-muted-foreground
      "
    >
      <Link
        className="
          transition-colors
          hover:text-foreground
        "
        href="/privacy"
      >
        Privacy Policy
      </Link>
      <Link
        className="
          transition-colors
          hover:text-foreground
        "
        href="/terms"
      >
        Terms
      </Link>
    </div>
  );
}
