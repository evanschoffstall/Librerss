import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import React from "react";

import "./globals.css";
import { AppThemeProvider, DebugBorder, DebugGrid } from "@/components";
import { ENV } from "@/lib/config";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  description: "Free cloud RSS Service",
  icons: {
    apple: "/favicon.svg",
    icon: "/favicon.svg",
  },
  title: "LibreRSS",
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
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`
          ${geist.variable}
          motion-profile-luxurious min-h-dvh bg-background font-sans
          text-foreground antialiased
        `}
      >
        {ENV.isDevelopment && (
          <>
            <DebugBorder />
            <DebugGrid />
          </>
        )}
        <AppThemeProvider>{children}</AppThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
