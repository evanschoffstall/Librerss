import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import React from "react";
import { AppThemeProvider, DebugBorder, DebugGrid } from "../components";
import { ENV } from "../lib";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LibreRSS",
  description: "Free cloud RSS Service",
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
      <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}>
        {ENV.isDevelopment && (
          <>
            <DebugBorder />
            <DebugGrid />
          </>
        )}
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
