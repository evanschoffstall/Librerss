import React from "react";
import styles from "./Menubar.module.css";
import Image from "next/image";
import Link from "next/link";

const MenuBar: React.FC = () => {
  return (
    <div className={styles.menuBar}>
      <div className="flex items-center">
        <Image
          className="px-3"
          src="/librerss.png"
          alt="LibreRSS"
          width={65}
          height={65}
        />
      </div>

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
