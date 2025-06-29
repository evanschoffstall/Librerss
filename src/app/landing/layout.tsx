import DebugBorder from "@/src/app/shared/components/Debug/DebugBorder/DebugBorder";
import DebugGrid from "@/src/app/shared/components/Debug/DebugGrid/DebugGrid";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import React from "react";
import Menubar from "./components/Menubar/Menubar";
import Space from "./components/Space/Space";
import "./landing.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LibreRSS",
  description: "Free cloud RSS Service",
};

export default function Landing({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDevelopment = process.env.NODE_ENV === "development";
  
  return (
    <>
      {isDevelopment && (
        <>
          <DebugBorder />
          <DebugGrid />
        </>
      )}
      <div className={inter.className}>
        <Space />
        <div className="glass">
          <Menubar />
          <div style={{ overflow: "auto", height: "100vh" }}>
            <main className="m-10">
              <div className="m-5 pt-10">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
