import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Debug from "@/app/shared/components/Debug/Debug";

const inter = Inter({ subsets: ["latin"] });

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {process.env.NODE_ENV === "development" && <Debug />}
      <body className={inter.className}>{children}</body>
    </html>
  );
}
