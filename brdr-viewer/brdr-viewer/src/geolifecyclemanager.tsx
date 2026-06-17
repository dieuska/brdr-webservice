import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./projections";
import GeoLifecycleManagerApp from "./geolifecycle/GeoLifecycleManagerApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GeoLifecycleManagerApp />
  </StrictMode>
);
