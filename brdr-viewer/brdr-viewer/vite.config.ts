import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    react(),
    {
      name: "viewer-redirect",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/viewer" || req.url === "/viewer/") {
            res.statusCode = 307;
            res.setHeader("Location", "/grb-viewer");
            res.end();
            return;
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/viewer" || req.url === "/viewer/") {
            res.statusCode = 307;
            res.setHeader("Location", "/grb-viewer");
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  base: "/",
  build: {
    rollupOptions: {
      input: {
        frontendHome: resolve(__dirname, "index.html"),
        grbViewer: resolve(__dirname, "grb-viewer.html"),
        viewerWfs: resolve(__dirname, "brk-viewer.html"),
        alignmentMfe: resolve(__dirname, "alignment-mfe.html"),
        alignmentMfeWfs: resolve(__dirname, "alignment-mfe-wfs.html"),
      },
    },
  },
}));


