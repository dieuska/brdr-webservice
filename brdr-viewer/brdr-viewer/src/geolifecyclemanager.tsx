import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./projections";
import GeoLifecycleManagerApp from "./geolifecycle/GeoLifecycleManagerApp";

function GeoLifecycleManagerPage() {
  useEffect(() => {
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousBodyHeight = body.style.height;
    const previousHtmlHeight = documentElement.style.height;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    body.style.height = "100%";
    documentElement.style.height = "100%";

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.height = previousBodyHeight;
      documentElement.style.height = previousHtmlHeight;
    };
  }, []);

  return <GeoLifecycleManagerApp />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GeoLifecycleManagerPage />
  </StrictMode>
);
