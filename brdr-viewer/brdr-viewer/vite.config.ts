import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Serve at root in dev, but build static assets for backend mount at /viewer.
  base: command === "build" ? "/viewer/" : "/",
}));
