"use client";

import React from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import DebugBorder from "@/app/shared/components/Debug/DebugBorder/DebugBorder";
import DebugGrid from "@/app/shared/components/Debug/DebugGrid/DebugGrid";

const inter = Inter({ subsets: ["latin"] });

export default function Layout({
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
