import "@/src/app/dashboard/dashboard.css";
import "@/src/app/globals.css";
import "@/src/app/landing/landing.css";
import { DebugBorder, DebugGrid } from "@/src/components";
import "@/src/components/components.css";
import { ENV } from "@/src/lib";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "primeicons/primeicons.css";
import "primereact/resources/primereact.min.css";
import "primereact/resources/themes/saga-blue/theme.css";
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
