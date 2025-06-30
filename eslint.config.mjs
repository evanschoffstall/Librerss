import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import globals from "globals";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    rules: {
      // Disable unused vars error in production
      "@typescript-eslint/no-unused-vars": "off",
      // Disable React in scope requirement
      "react/react-in-jsx-scope": "off",
      // Disable prop-types validation since we're using TypeScript
      "react/prop-types": "off",
    },
  },
];
