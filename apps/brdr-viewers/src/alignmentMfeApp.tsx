import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrdrAlignmentViewer } from "./components/alignment/BrdrAlignmentViewer";
import { BrdrCompactAlignmentViewer } from "./components/alignment/BrdrCompactAlignmentViewer";
import type {
  BrdrAlignmentParams,
  BrdrSupportedCrs,
} from "./components/alignment/contracts";
import {
  isAllowedOrigin,
  isAlignmentInitMessage,
  isOriginAllowedByConfig,
  parseAllowedOriginsConfig,
  type AlignmentApplyMessage,
} from "./components/alignment/messageSecurity";
import type { Geometry } from "./types/brdr";

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
  const [authorizationError, setAuthorizationError] = useState<string | null>(null);
  const hostOriginRef = useRef<string | null>(null);

  useEffect(() => {
    const allowedOrigins = parseAllowedOriginsConfig(
      import.meta.env.VITE_BRDR_ALLOWED_HOST_ORIGINS
    );
    const configuredHostOrigin = new URLSearchParams(window.location.search).get(
      "hostOrigin"
    );
    const expectedHostOrigin = isAllowedOrigin(configuredHostOrigin)
      ? configuredHostOrigin
      : null;

    if (
      expectedHostOrigin &&
      !isOriginAllowedByConfig(expectedHostOrigin, allowedOrigins)
    ) {
      setAuthorizationError(
        `Embedding origin "${expectedHostOrigin}" is not allowed for this MFE.`
      );
      return;
    }

    let hostOrigin: string | null = null;

    function onMessage(event: MessageEvent<unknown>) {
      if (event.source !== window.parent) return;
      if (!isAlignmentInitMessage(event.data)) return;
      if (expectedHostOrigin && event.origin !== expectedHostOrigin) return;
      if (!isOriginAllowedByConfig(event.origin, allowedOrigins)) return;

      const message = event.data;
      if (!hostOrigin) {
        hostOrigin = event.origin;
        hostOriginRef.current = event.origin;
      }
      if (event.origin !== hostOrigin) return;
      setCrs(message.payload.crs);
      setGeometry(message.payload.geometry);
    }

    window.addEventListener("message", onMessage as EventListener);
    window.parent.postMessage(
      { type: "BRDR_ALIGNMENT_READY" },
      expectedHostOrigin ?? window.location.origin
    );

    return () => {
      window.removeEventListener("message", onMessage as EventListener);
    };
  }, []);

  if (authorizationError) {
    return <div className="alignment-mfe-waiting">{authorizationError}</div>;
  }

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
          if (!hostOriginRef.current) return;
          const message: AlignmentApplyMessage = {
            type: "BRDR_ALIGNMENT_APPLY",
            payload: { geometry: nextGeometry },
          };
          window.parent.postMessage(message, hostOriginRef.current);
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
