import "tailwindcss/tailwind.css";
import { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
}

export const Container: React.FC<ContainerProps> = ({ children }) => (
  <div className="container mx-auto px-4">{children}</div>
);
