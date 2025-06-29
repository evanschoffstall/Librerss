import { DebugBorder, DebugGrid, Menubar, Space } from "@/src/components";
import { ENV } from "@/src/shared";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import React from "react";
import "@/src/styles/landing.css";

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
  return (
    <>
      {ENV.isDevelopment && (
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
