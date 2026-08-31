import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./App.css";
import "ol/ol.css";
import "./projections";
import { CrsComparisonViewer } from "./components/demo/CrsComparisonViewer";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CrsComparisonViewer />
  </StrictMode>
);
