import Image from "next/image";
import Link from "next/link";
import React from "react";
import styles from "./Menubar.module.css";

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
        <Link href="/" className={styles.menuButton}>
          Home
        </Link>
        <Link href="/about" className={styles.menuButton}>
          About
        </Link>
        <Link href="/contact" className={styles.menuButton}>
          Contact
        </Link>
      </div>
    </div>
  );
};

export default MenuBar;
