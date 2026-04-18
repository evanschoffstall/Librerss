"use client";

import { useEffect } from "react";

import { LoginViewSkeleton } from "./LoginViewSkeleton";

interface DevAutoLoginRedirectProps {
  autoLoginPath: string;
}

/**
 * Performs a hard navigation to the dev auto-login route so the browser, not
 * the App Router RSC fetch layer, owns the cookie-setting redirect chain.
 * @param root0
 * @param root0.autoLoginPath
 */
export function DevAutoLoginRedirect({
  autoLoginPath,
}: DevAutoLoginRedirectProps) {
  useEffect(() => {
    window.location.replace(autoLoginPath);
  }, [autoLoginPath]);

  return <LoginViewSkeleton />;
}
