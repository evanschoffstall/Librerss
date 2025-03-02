import DebugBorder from "@/app/shared/components/Debug/DebugBorder/DebugBorder";
import DebugGrid from "@/app/shared/components/Debug/DebugGrid/DebugGrid";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "primeicons/primeicons.css";
import { Button } from "primereact/button";
import "primereact/resources/primereact.min.css";
import "primereact/resources/themes/saga-blue/theme.css";
import React from "react";
import "./app.css";

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
    <>
      {process.env.NODE_ENV === "development" && (
        <>
          <DebugBorder />
          <DebugGrid />
        </>
      )}
      <div className={inter.className}>{children}</div>
    </>
  );
}
