import { MENU_ITEMS } from "@/src/lib";
import "@/src/styles/components.css";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export const Menubar: React.FC = () => (
  <div className="menu-bar">
    <Image
      className="px-3"
      src="/librerss.png"
      alt="LibreRSS"
      width={55}
      height={55}
      style={{ position: "absolute" }}
    />
    <div className="menu-bar-items">
      {MENU_ITEMS.map(({ href, label }) => (
        <Link key={href} href={href} className="menu-button">
          {label}
        </Link>
      ))}
    </div>
  </div>
);
