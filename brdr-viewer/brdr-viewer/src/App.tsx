import { useEffect, useMemo, useRef, useState } from "react";
import { BRDR_CRS_3812 } from "./components/alignment/contracts";
import {
  DemoMapViewer,
  type DemoGeometryItem,
} from "./components/demo/DemoMapViewer";
import type { Geometry } from "./types/brdr";
import "./App.css";
import "ol/ol.css";

function App() {
  const demoCrs = BRDR_CRS_3812;
  const alignmentMfeUrl = `${import.meta.env.BASE_URL}alignment-mfe.html`;
  const nextIdRef = useRef(3);
  const [geometries, setGeometries] = useState<DemoGeometryItem[]>([
    {
      id: "geom-0",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [674109.9060417357, 679157.1345025133],
          [674108.4632313423, 679157.3194291368],
          [674067.2685345449, 679162.5997789158],
          [674067.2641152102, 679162.762377074],
          [674072.146275945, 679192.1411212096],
          [674118.837324664, 679183.5345530929],
          [674114.534713809, 679160.413227425],
          [674109.9508475964, 679157.1662145937],
          [674109.9060417357, 679157.1345025133],
        ]],
      },
    },
    {
      id: "geom-1",
      geometry: {
        type: "MultiLineString",
        coordinates: [[
          [673273.1596810865, 679548.1767614188],
          [673301.0447058184, 679562.6421179984],
          [673326.4897908862, 679572.5761580592],
          [673358.0347251141, 679584.6015749747],
          [673401.430794853, 679601.1583084093],
          [673411.5391163183, 679605.1667807145],
          [673411.5391163183, 679605.1667807145],
        ]],
      },
    },
    {
      id: "geom-2",
      geometry: {
        type: "Point",
        coordinates: [674039.5, 679140.2],
      },
    },
  ]);
  const [selectedGeometryId, setSelectedGeometryId] = useState<string | null>(
    "geom-0"
  );
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const [activeReferenceLayers, setActiveReferenceLayers] = useState<string[]>([]);
  const alignmentFrameRef = useRef<HTMLIFrameElement | null>(null);
  const alignmentReadyRef = useRef(false);

  const selectedGeometry = useMemo(
    () =>
      selectedGeometryId
        ? geometries.find((item) => item.id === selectedGeometryId)?.geometry ?? null
        : null,
    [geometries, selectedGeometryId]
  );

  useEffect(() => {
    function postGeometryToAlignmentFrame() {
      if (!alignmentOpen || !selectedGeometry) return;
      if (!alignmentReadyRef.current) return;
      const frameWindow = alignmentFrameRef.current?.contentWindow;
      if (!frameWindow) return;

      frameWindow.postMessage(
        {
          type: "BRDR_ALIGNMENT_INIT",
          payload: { crs: demoCrs, geometry: selectedGeometry },
        },
        window.location.origin
      );
    }

    postGeometryToAlignmentFrame();
  }, [alignmentOpen, demoCrs, selectedGeometry]);

  useEffect(() => {
    function onMessage(
      event: MessageEvent<
        | { type: "BRDR_ALIGNMENT_READY" }
        | { type: "BRDR_ALIGNMENT_APPLY"; payload: { geometry: Geometry } }
      >
    ) {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || typeof message !== "object") return;

      if (message.type === "BRDR_ALIGNMENT_READY") {
        alignmentReadyRef.current = true;
        if (alignmentOpen && selectedGeometry && alignmentFrameRef.current?.contentWindow) {
          alignmentFrameRef.current.contentWindow.postMessage(
            {
              type: "BRDR_ALIGNMENT_INIT",
              payload: { crs: demoCrs, geometry: selectedGeometry },
            },
            window.location.origin
          );
        }
        return;
      }

      if (message.type === "BRDR_ALIGNMENT_APPLY") {
        updateSelectedGeometry(message.payload.geometry);
        setAlignmentOpen(false);
      }
    }

    window.addEventListener("message", onMessage as EventListener);
    return () => window.removeEventListener("message", onMessage as EventListener);
  }, [alignmentOpen, demoCrs, selectedGeometry]);

  function createGeometryId() {
    const id = `geom-${nextIdRef.current}`;
    nextIdRef.current += 1;
    return id;
  }

  function addGeometry(geometry: Geometry) {
    const id = createGeometryId();
    setGeometries((prev) => [...prev, { id, geometry }]);
    setSelectedGeometryId(id);
  }

  function updateSelectedGeometry(geometry: Geometry) {
    if (!selectedGeometryId) {
      addGeometry(geometry);
      return;
    }

    setGeometries((prev) =>
      prev.map((item) =>
        item.id === selectedGeometryId ? { ...item, geometry } : item
      )
    );
  }

  function handleDeleteSelectedGeometry() {
    if (!selectedGeometryId) {
      return;
    }

    setGeometries((prev) =>
      prev.filter((item) => item.id !== selectedGeometryId)
    );
    setSelectedGeometryId(null);
    setAlignmentOpen(false);
  }

  return (
    <>
      <DemoMapViewer
        crs={demoCrs}
        geometries={geometries}
        selectedGeometryId={selectedGeometryId}
        selectedGeometry={selectedGeometry}
        onSelectGeometry={setSelectedGeometryId}
        onGeometryDrawn={addGeometry}
        onDeleteSelectedGeometry={handleDeleteSelectedGeometry}
        onStartAlignment={() => {
          if (!selectedGeometry) return;
          alignmentReadyRef.current = false;
          setAlignmentOpen(true);
        }}
        activeReferenceLayers={activeReferenceLayers}
        onActiveReferenceLayersChange={setActiveReferenceLayers}
        onImportGeometries={(newGeometries) => {
          if (newGeometries.length === 0) return;
          const nextItems = newGeometries.map((geometry) => ({
            id: createGeometryId(),
            geometry,
          }));
          setGeometries((prev) => [...prev, ...nextItems]);
          setSelectedGeometryId(nextItems[nextItems.length - 1].id);
        }}
      />

      {alignmentOpen && selectedGeometry && (
        <div className="alignment-modal-backdrop">
          <div className="alignment-modal">
            <div className="alignment-modal-header">
              <strong>BRDR alignering (EPSG:3812)</strong>
              <button
                type="button"
                className="alignment-close-button"
                onClick={() => {
                  alignmentReadyRef.current = false;
                  setAlignmentOpen(false);
                }}
              >
                Sluiten
              </button>
            </div>
            <div className="alignment-modal-body">
              <iframe
                ref={alignmentFrameRef}
                title="BRDR Alignment MFE"
                className="alignment-mfe-frame"
                src={alignmentMfeUrl}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
