import { AppThemeProvider, DebugBorder, DebugGrid } from "@/components";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import React from "react";
import { ENV } from "../lib";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "LibreRSS",
  description: "Free cloud RSS Service",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geist.variable} font-sans motion-profile-luxurious min-h-screen bg-background text-foreground antialiased`}
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
