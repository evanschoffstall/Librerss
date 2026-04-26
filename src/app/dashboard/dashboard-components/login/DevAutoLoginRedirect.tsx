"use client";

import { useEffect } from "react";

import { LoginViewSkeleton } from "./LoginViewSkeleton";

/**
 * Describes the props for the dev auto login redirect component.
 */
interface DevAutoLoginRedirectProps {
  autoLoginPath: string;
}

/**
 * Render the dev auto login redirect component.
 * @param props - The component props.
 * @returns The rendered dev auto login redirect component.
 */
export function DevAutoLoginRedirect(props: DevAutoLoginRedirectProps) {
  const { autoLoginPath } = props;
  useEffect(() => {
    window.location.replace(autoLoginPath);
  }, [autoLoginPath]);

  return <LoginViewSkeleton />;
}
