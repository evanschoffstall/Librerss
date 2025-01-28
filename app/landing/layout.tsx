import React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Menubar from "./components/Menubar/Menubar";
import Space from "./components/Space/Space";

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
    <html lang="en">
      <body className={inter.className}>
        <Space />
        <div className="glass">
          <Menubar />
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
