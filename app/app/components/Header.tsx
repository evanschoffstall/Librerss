import "tailwindcss/tailwind.css";

interface HeaderProps {
  title: string;
}

export const Header: React.FC<HeaderProps> = ({ title }) => (
  <h1 className="text-4xl font-bold mb-4">{title}</h1>
);
