import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Menubar from "./components/Menubar/Menubar";
import Debug from "./components/Debug/Debug";
import Space from "./components/Space/Space";

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
        <Space />
        <Debug />
        <header>
          <Menubar />
        </header>
        <div style={{ overflow: "auto", height: "calc(100vh - 50px)" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
