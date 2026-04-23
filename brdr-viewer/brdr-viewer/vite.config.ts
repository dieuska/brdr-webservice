import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Serve at root in dev, but build static assets for backend mount at /viewer.
  base: command === "build" ? "/viewer/" : "/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        alignmentMfe: resolve(__dirname, "alignment-mfe.html"),
      },
    },
  },
}));
