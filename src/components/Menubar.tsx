import { MENU_ITEMS } from "@/src/app/landing/constants";
import "@/src/styles/components.css";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export const Menubar: React.FC = () => {
  const handleScrollToSection = (sectionId: string) => {
    // Find the scroll container (the main content area)
    const scrollContainer = document.querySelector('div[style*="overflow"]') as HTMLElement;

    if (sectionId === '#top') {
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    const elementId = sectionId.replace('#', '');
    const element = document.getElementById(elementId);

    if (element && scrollContainer) {
      // Get the position of the element relative to the scroll container
      const elementTop = element.offsetTop;
      const menuBar = document.querySelector('.menu-bar') as HTMLElement;
      const menuBarHeight = menuBar ? menuBar.offsetHeight : 75;

      const targetScrollTop = elementTop - menuBarHeight - 20;

      scrollContainer.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    } else if (element) {
      const menuBar = document.querySelector('.menu-bar') as HTMLElement;
      const menuBarHeight = menuBar ? menuBar.offsetHeight : 75;
      const offsetTop = element.offsetTop - menuBarHeight - 20;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }
  };

  return (
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
        {MENU_ITEMS.map(({ href, label, type }) => {
          if (type === 'scroll') {
            return (
              <button
                key={href}
                onClick={(e) => {
                  e.preventDefault();
                  handleScrollToSection(href);
                }}
                className="menu-button"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {label}
              </button>
            );
          }
          return (
            <Link key={href} href={href} className="menu-button">
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
};
