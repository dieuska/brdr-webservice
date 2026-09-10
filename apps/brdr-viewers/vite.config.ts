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
        crsViewer: resolve(__dirname, "crs-viewer.html"),
        viewerWfs: resolve(__dirname, "brk-viewer.html"),
        geoLifecycleManager: resolve(__dirname, "geolifecyclemanager.html"),
        heritageLifecycle: resolve(__dirname, "erfgoed-lifecycle.html"),
        alignmentMfe: resolve(__dirname, "alignment-mfe.html"),
        alignmentMfeWfs: resolve(__dirname, "alignment-mfe-wfs.html"),
        alignmentMfeSimple: resolve(__dirname, "alignment-mfe-simple.html"),
        alignmentMfeWfsSimple: resolve(__dirname, "alignment-mfe-wfs-simple.html"),
      },
    },
  },
}));


