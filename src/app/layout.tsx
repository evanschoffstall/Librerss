import type { Metadata, Viewport } from "next";

import { Analytics } from "@vercel/analytics/next";
import { Geist } from "next/font/google";
import React from "react";

import { AppThemeProvider, DebugBorder, DebugGrid } from "@/components";
import { isDevelopment } from "@/lib";
import { PUBLIC_APP_NAME, PUBLIC_BRAND_ASSETS } from "@/public";

import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  description: "Free cloud RSS Service",
  icons: {
    apple: PUBLIC_BRAND_ASSETS.favicon,
    icon: PUBLIC_BRAND_ASSETS.favicon,
  },
  title: PUBLIC_APP_NAME,
};

export const viewport: Viewport = {
  initialScale: 1,
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const developmentMode = isDevelopment();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`
          ${geist.variable}
          motion-profile-luxurious min-h-dvh bg-background font-sans
          text-foreground antialiased
        `}
      >
        {developmentMode && (
          <>
            <DebugBorder />
            <DebugGrid />
          </>
        )}
        <AppThemeProvider>{children}</AppThemeProvider>
        {!developmentMode ? <Analytics /> : null}
      </body>
    </html>
  );
}
