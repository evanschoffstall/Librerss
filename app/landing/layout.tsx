import React from "react";
import type { Metadata } from "next";
import Menubar from "./components/Menubar/Menubar";
import Space from "./components/Space/Space";
import DebugBorder from "@/app/shared/components/Debug/DebugBorder/DebugBorder";
import DebugGrid from "@/app/shared/components/Debug/DebugGrid/DebugGrid";
import "./landing.css";

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
    <html lang="en">
      {
        process.env.NODE_ENV === "development" && (
          <>
            <DebugBorder />
            <DebugGrid />
          </>
        )
      }
      <body>
        <Space />
        <div className="glass">
          <Menubar />
          {/*Permits Space background to be static and not scrolling*/}
          <div style={{ overflow: "auto", height: "100vh" }}>
            <main className="m-10">
              <div className="m-5 pt-10">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
