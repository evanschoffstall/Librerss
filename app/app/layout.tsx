import React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./app.css";
import DebugBorder from "@/app/shared/components/Debug/DebugBorder/DebugBorder";
import DebugGrid from "@/app/shared/components/Debug/DebugGrid/DebugGrid";



const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LibreRSS",
  description: "Free cloud RSS Service",
};

export default function App({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {process.env.NODE_ENV === "development" && (
        <>
          <DebugBorder />
          <DebugGrid />
        </>
      )}
      <body className={inter.className}>{children}</body>
    </html>
  );
}
