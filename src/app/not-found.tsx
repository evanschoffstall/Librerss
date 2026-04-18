import { ArrowLeft, FileQuestion } from "lucide-react";
import Link from "next/link";

import { StatusPage } from "@/app/app-components";
import { Button } from "@/components/ui/button";

/**
 * Render the not found component.
 * @returns The rendered not found component.
 */
export default function NotFound() {
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
      code="404"
      eyebrow="Page not found"
      icon={FileQuestion}
      message="The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved."
    />
  );
}
