"use client";

import React from "react";
import styles from "./Menubar.module.css";
import Image from "next/image";
import Link from "next/link";

const MenuBar: React.FC = () => {
  return (
    <div className={styles.menuBar}>
      <Image
        className="px-3"
        src="/librerss.png"
        alt="LibreRSS"
        width={55}
        height={55}
        style={{ position: "absolute" }}
      />

      <div className={styles.menuBarItems}>
        <Link href="/">
          <button>Home</button>
        </Link>
        <Link href="/about">
          <button>About</button>
        </Link>
        <Link href="/contact">
          <button>Contact</button>
        </Link>
      </div>
    </div>
  );
};

export default MenuBar;
