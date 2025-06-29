import { DebugBorder, DebugGrid } from "@/src/components";
import { ENV } from "@/src/shared";
import "@/src/styles/dashboard.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "primeicons/primeicons.css";
import "primereact/resources/primereact.min.css";
import "primereact/resources/themes/saga-blue/theme.css";
import React from "react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LibreRSS Dashboard",
  description: "Free cloud RSS Service - Dashboard",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {ENV.isDevelopment && (
        <>
          <DebugBorder />
          <DebugGrid />
        </>
      )}
      <div className={inter.className}>{children}</div>
    </>
  );
}
