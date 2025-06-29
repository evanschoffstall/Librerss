import { MENU_ITEMS } from "@/src/constants";
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
        {MENU_ITEMS.map(({ href, label }) => (
          <Link key={href} href={href} className={styles.menuButton}>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
};

export default MenuBar;
