import path from "path";
import { fileURLToPath } from "url";

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "postcss-import": {
      // Custom resolver function
      resolve(id) {
        if (id.startsWith("@/")) {
          // Replace '@/' with the absolute path to the root directory
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          return path.resolve(__dirname, id.slice(2));
        }
        // Return the original id for other imports
        return id;
      },
    },
    "tailwindcss/nesting": "postcss-nesting",
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
