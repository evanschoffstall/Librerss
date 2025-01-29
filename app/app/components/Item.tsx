"use client";

import "tailwindcss/tailwind.css";
import React from "react";
export interface ItemProps {
  title?: string;
  link?: string;
  content?: string;
}

export const Item: React.FC<ItemProps> = ({ title, link, content }) => (
  <div className="mb-8">
    <a href={link} className="text-2xl font-bold">
      {title}
    </a>
    <p className="mt-2">{content}</p>
  </div>
);
