import React from "react";
import styles from "./MenuBar.module.css";
import Image from "next/image";

const MenuBar: React.FC = () => {
  return (
    <div className={styles.menuBar}>
      <div className="flex items-center pr-10">
        <Image
          className="px-3"
          src="/librerss.png"
          alt="LibreRSS"
          width={75}
          height={75}
        />
        <p className="text-3xl font-bold">LibreRSS</p>
      </div>

      <div className={styles.menuBarItems}>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </div>
    </div>
  );
};

export default MenuBar;
