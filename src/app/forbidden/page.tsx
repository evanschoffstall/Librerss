import { ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { StatusPage } from "@/app/app-components";
import { Button } from "@/components/ui/button";

/**
 * Render the forbidden page component.
 * @returns The rendered forbidden page component.
 */
export default function ForbiddenPage() {
  return (
    <StatusPage
      action={
        <Button asChild className="h-11 rounded-xl px-6" size="lg">
          <Link className="inline-flex items-center gap-2" href="/landing">
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
        </Button>
      }
      code="403"
      eyebrow="Access denied"
      icon={ShieldAlert}
      message="You do not have access to this page. If you expected this request to succeed, return home and try a supported route."
    />
  );
}
