import { redirect } from "next/navigation";

import { isDevAutoLoginEnabled } from "@/lib/auth/dev-auto-login";

export default function Home() {
  redirect(isDevAutoLoginEnabled() ? "/dashboard" : "/landing");
}
