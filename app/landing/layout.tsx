import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Debug from "@/app/shared/components/Debug/Debug";
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
        {process.env.NODE_ENV === "development" && <Debug />}
        <div className="glass">
          <header>
            <Menubar />
          </header>
          <div style={{ overflow: "auto", height: "calc(100vh - 50px)" }}>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
