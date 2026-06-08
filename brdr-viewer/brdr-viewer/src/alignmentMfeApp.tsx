import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrdrAlignmentViewer } from "./components/alignment/BrdrAlignmentViewer";
import { BrdrCompactAlignmentViewer } from "./components/alignment/BrdrCompactAlignmentViewer";
import type {
  BrdrAlignmentParams,
  BrdrSupportedCrs,
} from "./components/alignment/contracts";
import type { Geometry } from "./types/brdr";

type InitMessage = {
  type: "BRDR_ALIGNMENT_INIT" | "BRDR_ALIGNMENT_UPDATE_GEOMETRY";
  payload: { crs: BrdrSupportedCrs; geometry: Geometry };
};

type ApplyMessage = {
  type: "BRDR_ALIGNMENT_APPLY";
  payload: { geometry: Geometry };
};

interface AlignmentMfeAppProps {
  initialRequestParams?: Partial<BrdrAlignmentParams>;
  headerTitle?: string;
  headerSubtitle?: string;
  variant?: "full" | "compact";
}

function AlignmentMfeApp({
  initialRequestParams,
  headerTitle,
  headerSubtitle,
  variant = "full",
}: AlignmentMfeAppProps) {
  const [crs, setCrs] = useState<BrdrSupportedCrs | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  useEffect(() => {
    let hostOrigin: string | null = null;

    function onMessage(event: MessageEvent<InitMessage>) {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (
        message.type !== "BRDR_ALIGNMENT_INIT" &&
        message.type !== "BRDR_ALIGNMENT_UPDATE_GEOMETRY"
      ) {
        return;
      }
      if (!hostOrigin) {
        hostOrigin = event.origin;
      }
      if (event.origin !== hostOrigin) return;
      setCrs(message.payload.crs);
      setGeometry(message.payload.geometry);
    }

    window.addEventListener("message", onMessage as EventListener);
    window.parent.postMessage(
      { type: "BRDR_ALIGNMENT_READY" },
      "*"
    );

    return () => {
      window.removeEventListener("message", onMessage as EventListener);
    };
  }, []);

  if (!crs || !geometry) {
    return <div className="alignment-mfe-waiting">Wachten op geometrie...</div>;
  }

  const ViewerComponent =
    variant === "compact" ? BrdrCompactAlignmentViewer : BrdrAlignmentViewer;

  return (
    <div className="alignment-mfe-root">
      <div className="alignment-powered-by">Powered by BRDR</div>
      {(headerTitle || headerSubtitle) && (
        <div className="alignment-mfe-header">
          {headerTitle && <strong>{headerTitle}</strong>}
          {headerSubtitle && <span>{headerSubtitle}</span>}
        </div>
      )}
      <ViewerComponent
        crs={crs}
        inputGeometry={geometry}
        initialRequestParams={initialRequestParams}
        onApplyAlignedGeometry={(nextGeometry) => {
          const message: ApplyMessage = {
            type: "BRDR_ALIGNMENT_APPLY",
            payload: { geometry: nextGeometry },
          };
          window.parent.postMessage(message, "*");
        }}
      />
    </div>
  );
}

export function mountAlignmentMfe(
  initialRequestParams?: Partial<BrdrAlignmentParams>,
  headerTitle?: string,
  headerSubtitle?: string,
  variant: "full" | "compact" = "full"
) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AlignmentMfeApp
        initialRequestParams={initialRequestParams}
        headerTitle={headerTitle}
        headerSubtitle={headerSubtitle}
        variant={variant}
      />
    </StrictMode>
  );
}
