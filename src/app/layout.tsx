import "@/src/app/globals.css";
import { DebugBorder, DebugGrid } from "@/src/components";
import { AppThemeProvider } from "@/src/components/AppThemeProvider";
import { ENV } from "@/src/lib";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import React from "react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LibreRSS",
  description: "Free cloud RSS Service",
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
