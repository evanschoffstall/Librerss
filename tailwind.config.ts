import plugin from "tailwindcss/plugin";
import { PluginAPI } from "tailwindcss/types/config";

module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      screens: {
        xs: "480px",
        "sm-md": "704px",
        "md-lg": "896px",
        "lg-xl": "1152px",
        "xl-2xl": "1408px",
      },
      spacing: Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [`${i + 1}p`, `${i + 1}%`])
      ),
      fontSize: Object.fromEntries(
        Array.from({ length: 11 }, (_, i) => [`${i + 10}xl`, `${i + 10}rem`])
      ),
      scale: Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => [`${i + 1}`, `${(i + 1) / 100}`]) // Converts 1-30 to 0.01-0.30
      ),
    },
  },
  plugins: [
    plugin(function (api: PluginAPI) {
      const { addUtilities } = api;

      const textStrokeUtilities = Object.fromEntries(
        Array.from({ length: 5 }, (_, i) => [
          `.text-stroke-${i + 1}`,
          { "-webkit-text-stroke-width": `${i + 1}px` },
        ])
      );

      addUtilities({
        ...textStrokeUtilities,
        ".text-stroke-white": { "-webkit-text-stroke-color": "white" },
        ".text-stroke-black": { "-webkit-text-stroke-color": "black" },
      });
    }),
  ],
};
