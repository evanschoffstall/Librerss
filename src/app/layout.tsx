import { DebugBorder, DebugGrid } from "@/src/components";
import { ENV } from "@/src/shared";
import "@/src/styles/components.css";
import "@/src/styles/dashboard.css";
import "@/src/styles/landing.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "primeicons/primeicons.css";
import "primereact/resources/primereact.min.css";
import "primereact/resources/themes/saga-blue/theme.css";
import React from "react";
import "./globals.css";

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
    <html lang="en">
      <body className={inter.className}>
        {ENV.isDevelopment && (
          <>
            <DebugBorder />
            <DebugGrid />
          </>
        )}
        {children}
      </body>
    </html>
  );
}
