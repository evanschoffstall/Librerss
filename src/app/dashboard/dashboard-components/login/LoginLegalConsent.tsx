import { LoginFieldError } from "@/app/dashboard/dashboard-components/login/LoginFieldError";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface LoginLegalConsentProps {
  errorMessage: string | undefined;
  hasAcceptedLegalTerms: boolean;
  onAcceptedChange: (checked: boolean) => void;
}

/** Renders the signup-only legal consent copy and checkbox. */
export function LoginLegalConsent({
  errorMessage,
  hasAcceptedLegalTerms,
  onAcceptedChange,
}: LoginLegalConsentProps) {
  return (
    <div
      className={
        errorMessage
          ? "rounded-xl border border-destructive/50 bg-muted/30 p-3"
          : "rounded-xl border border-border/60 bg-muted/30 p-3"
      }
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={hasAcceptedLegalTerms}
          id="auth-legal-consent"
          onCheckedChange={(checked: "indeterminate" | boolean) => {
            onAcceptedChange(checked === true);
          }}
        />
        <Label
          className="space-y-1 text-xs/5 text-muted-foreground"
          htmlFor="auth-legal-consent"
        >
          <span className="block text-foreground">
            I accept the current Privacy Policy and Terms for this deployment.
          </span>
          <span className="block">
            Other LibreRSS deployments, and future versions of this software,
            may publish different terms or data-handling disclosures.
          </span>
        </Label>
      </div>
      <LoginFieldError message={errorMessage} />
    </div>
  );
}
