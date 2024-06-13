import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Menubar from "./components/Menubar/Menubar";
import Debug from "./components/Debug/Debug";

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
        <Debug />
        <header>
          <Menubar />
        </header>
        {children}
      </body>
    </html>
  );
}
