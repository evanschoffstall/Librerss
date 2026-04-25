import { redirect } from "next/navigation";

import { isDevAutoLoginEnabled } from "@/lib/auth";
import { PUBLIC_APP_PATHS } from "@/public";

/**
 * Render the home component.
 */
export default function Home() {
  redirect(
    isDevAutoLoginEnabled()
      ? PUBLIC_APP_PATHS.dashboard
      : PUBLIC_APP_PATHS.landing,
  );
}
