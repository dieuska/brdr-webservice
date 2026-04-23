import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrdrAlignmentViewer } from "./components/alignment/BrdrAlignmentViewer";
import type { BrdrSupportedCrs } from "./components/alignment/contracts";
import type { Geometry } from "./types/brdr";
import "./index.css";
import "./App.css";
import "ol/ol.css";
import "./projections";

type InitMessage = {
  type: "BRDR_ALIGNMENT_INIT" | "BRDR_ALIGNMENT_UPDATE_GEOMETRY";
  payload: { crs: BrdrSupportedCrs; geometry: Geometry };
};

type ApplyMessage = {
  type: "BRDR_ALIGNMENT_APPLY";
  payload: { geometry: Geometry };
};

function AlignmentMfeApp() {
  const [crs, setCrs] = useState<BrdrSupportedCrs | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent<InitMessage>) {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (
        message.type !== "BRDR_ALIGNMENT_INIT" &&
        message.type !== "BRDR_ALIGNMENT_UPDATE_GEOMETRY"
      ) {
        return;
      }
      setCrs(message.payload.crs);
      setGeometry(message.payload.geometry);
    }

    window.addEventListener("message", onMessage as EventListener);
    window.parent.postMessage(
      { type: "BRDR_ALIGNMENT_READY" },
      window.location.origin
    );

    return () => {
      window.removeEventListener("message", onMessage as EventListener);
    };
  }, []);

  if (!crs || !geometry) {
    return <div className="alignment-mfe-waiting">Wachten op geometrie...</div>;
  }

  return (
    <BrdrAlignmentViewer
      crs={crs}
      inputGeometry={geometry}
      onApplyAlignedGeometry={(nextGeometry) => {
        const message: ApplyMessage = {
          type: "BRDR_ALIGNMENT_APPLY",
          payload: { geometry: nextGeometry },
        };
        window.parent.postMessage(message, window.location.origin);
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AlignmentMfeApp />
  </StrictMode>
);
