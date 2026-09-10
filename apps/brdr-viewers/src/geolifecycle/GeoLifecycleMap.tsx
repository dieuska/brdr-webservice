import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import Map from "ol/Map";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type { Geometry as OlGeometry } from "ol/geom";
import Draw from "ol/interaction/Draw";
import VectorLayer from "ol/layer/Vector";
import { transformExtent } from "ol/proj";
import VectorSource from "ol/source/Vector";
import View from "ol/View";
import { bbox as bboxStrategy } from "ol/loadingstrategy";
import {
  BASE_LAYER_GRB_GRAY,
  BASE_LAYER_KEY,
  createBaseLayers,
  DEFAULT_BASE_LAYER_VISIBILITY,
} from "../components/map/layers/baseLayers";
import type { Geometry } from "../types/brdr";
import "../components/map/MapView.css";
import "ol/ol.css";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";

const ADPF_COLLECTIONS_BASE =
  "https://geo.api.vlaanderen.be/Adpf/ogc/features/v1/collections";
const OGC_OUTPUT_CRS_31370 = "http://www.opengis.net/def/crs/EPSG/0/31370";
const OGC_OUTPUT_CRS_CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";
const OGC_RESPONSE_FORMAT = "application/json";
const OGC_FETCH_LIMIT = 5000;
const OGC_REFERENCE_MIN_ZOOM = 16;

const referenceStyle = new Style({
  stroke: new Stroke({
    color: "rgba(15, 23, 42, 0.5)",
    width: 1.15,
  }),
  fill: new Fill({
    color: "rgba(15, 23, 42, 0.06)",
  }),
});

const originalStyle = new Style({
  stroke: new Stroke({
    color: "rgba(30, 64, 175, 0.95)",
    width: 2,
    lineDash: [8, 5],
  }),
  fill: new Fill({
    color: "rgba(59, 130, 246, 0.08)",
  }),
});

const managedStyle = new Style({
  stroke: new Stroke({
    color: "rgba(22, 101, 52, 0.95)",
    width: 2.6,
  }),
  fill: new Fill({
    color: "rgba(34, 197, 94, 0.2)",
  }),
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "rgba(22, 101, 52, 0.95)" }),
    stroke: new Stroke({ color: "#ffffff", width: 1.2 }),
  }),
});

const proposalStyle = new Style({
  stroke: new Stroke({
    color: "rgba(153, 27, 27, 0.95)",
    width: 2.6,
    lineDash: [10, 6],
  }),
  fill: new Fill({
    color: "rgba(239, 68, 68, 0.14)",
  }),
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "rgba(185, 28, 28, 0.95)" }),
    stroke: new Stroke({ color: "#ffffff", width: 1.2 }),
  }),
});

const draftStyle = new Style({
  stroke: new Stroke({
    color: "rgba(202, 138, 4, 0.95)",
    width: 2.8,
  }),
  fill: new Fill({
    color: "rgba(250, 204, 21, 0.2)",
  }),
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "rgba(202, 138, 4, 0.95)" }),
    stroke: new Stroke({ color: "#ffffff", width: 1.2 }),
  }),
});

function capakeyFromImpactItem(item: string) {
  return item.replace(/\s+\([^()]*%\)$/, "");
}

interface Props {
  variant: "source" | "managed";
  view: View;
  referenceCollectionId: string | null;
  showReferenceLayer: boolean;
  showGrbBackground: boolean;
  originalGeometry: Geometry | null;
  managedGeometry: Geometry | null;
  proposalGeometry: Geometry | null;
  draftGeometry: Geometry | null;
  unmanagedImpactItems: string[];
  managedImpactItems: string[];
  impactContextLabel: string;
  loading: boolean;
  drawRequestToken: number;
  onDrawn: (geometry: Geometry) => void;
  actionContent?: ReactNode;
}

interface PaneProps {
  title: string;
  subtitle: string;
  referenceSource: VectorSource | null;
  showReferenceLayer: boolean;
  showGrbBackground: boolean;
  view: View;
  primaryGeometry: Geometry | null;
  secondaryGeometry: Geometry | null;
  primaryStyle: Style;
  secondaryStyle: Style;
  primaryLabel: string;
  secondaryLabel: string;
  impactTitle: string;
  impactItems: string[];
  impactContextLabel: string;
  compareTitle: string;
  compareItems: string[];
  loading: boolean;
  drawEnabled?: boolean;
  drawRequestToken?: number;
  onDrawn?: (geometry: Geometry) => void;
}

function buildItemsUrl(collectionId: string, extent31370: number[]) {
  const [minX, minY, maxX, maxY] = extent31370;
  const bbox4326 = transformExtent(extent31370, "EPSG:31370", "EPSG:4326");
  const [lonMin, latMin, lonMax, latMax] = bbox4326;

  const paramsProjected = new URLSearchParams({
    f: OGC_RESPONSE_FORMAT,
    limit: String(OGC_FETCH_LIMIT),
    bbox: `${minX},${minY},${maxX},${maxY}`,
    "bbox-crs": OGC_OUTPUT_CRS_31370,
    crs: OGC_OUTPUT_CRS_31370,
  });

  const paramsCrs84 = new URLSearchParams({
    f: OGC_RESPONSE_FORMAT,
    limit: String(OGC_FETCH_LIMIT),
    bbox: `${lonMin},${latMin},${lonMax},${latMax}`,
    "bbox-crs": OGC_OUTPUT_CRS_CRS84,
    crs: OGC_OUTPUT_CRS_CRS84,
  });

  const base = `${ADPF_COLLECTIONS_BASE}/${encodeURIComponent(collectionId)}/items`;
  return [
    { url: `${base}?${paramsProjected.toString()}`, dataProjection: "EPSG:31370" },
    { url: `${base}?${paramsCrs84.toString()}`, dataProjection: "EPSG:4326" },
  ];
}

function createReferenceSource(collectionId: string | null) {
  const format = new GeoJSON();
  const source = new VectorSource({
    format,
    strategy: bboxStrategy,
  });

  source.setLoader(async (extent) => {
    if (!collectionId) {
      source.removeLoadedExtent(extent);
      return;
    }

    let loaded = false;
    for (const request of buildItemsUrl(collectionId, extent)) {
      try {
        const response = await fetch(request.url);
        if (!response.ok) {
          continue;
        }
        const payload = await response.json();
        const features = format.readFeatures(payload, {
          dataProjection: request.dataProjection,
          featureProjection: "EPSG:31370",
        });
        source.addFeatures(features);
        loaded = true;
        break;
      } catch {
        // Try next URL shape.
      }
    }

    if (!loaded) {
      source.removeLoadedExtent(extent);
    }
  });

  return source;
}

function setSingleGeometryFeature(
  source: VectorSource | null,
  geometry: Geometry | null,
  format: GeoJSON
) {
  if (!source) return;
  source.clear();
  if (!geometry) return;
  const feature = format.readFeature(
    { type: "Feature", geometry },
    {
      dataProjection: "EPSG:31370",
      featureProjection: "EPSG:31370",
    }
  ) as Feature<OlGeometry>;
  source.addFeature(feature);
}

function getGeometryExtent(
  geometry: Geometry | null,
  format: GeoJSON
): number[] | null {
  if (!geometry) {
    return null;
  }

  const feature = format.readFeature(
    { type: "Feature", geometry },
    {
      dataProjection: "EPSG:31370",
      featureProjection: "EPSG:31370",
    }
  ) as Feature<OlGeometry>;
  const extent = feature.getGeometry()?.getExtent();
  if (!extent || !extent.every(Number.isFinite)) {
    return null;
  }
  return extent;
}

function fitMapToGeometries(
  view: View,
  format: GeoJSON,
  geometries: Array<Geometry | null>
) {
  const extents = geometries
    .map((geometry) => getGeometryExtent(geometry, format))
    .filter((extent): extent is number[] => Boolean(extent));

  if (extents.length === 0) {
    return;
  }

  const [firstExtent, ...rest] = extents;
  const combined = [...firstExtent];
  for (const extent of rest) {
    combined[0] = Math.min(combined[0], extent[0]);
    combined[1] = Math.min(combined[1], extent[1]);
    combined[2] = Math.max(combined[2], extent[2]);
    combined[3] = Math.max(combined[3], extent[3]);
  }

  view.fit(combined, {
    padding: [32, 32, 32, 32],
    maxZoom: 21,
    duration: 0,
  });
}

function LifecycleMapPane({
  title,
  subtitle,
  referenceSource,
  showReferenceLayer,
  showGrbBackground,
  view,
  primaryGeometry,
  secondaryGeometry,
  primaryStyle,
  secondaryStyle,
  primaryLabel,
  secondaryLabel,
  impactTitle,
  impactItems,
  impactContextLabel,
  compareTitle,
  compareItems,
  loading,
  drawEnabled = false,
  drawRequestToken,
  onDrawn,
}: PaneProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const lastDrawTokenRef = useRef(-1);
  const referenceLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const primaryLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const secondaryLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const primarySourceRef = useRef<VectorSource | null>(null);
  const secondarySourceRef = useRef<VectorSource | null>(null);
  const format = useMemo(() => new GeoJSON(), []);
  const compareCapakeys = useMemo(
    () => new Set(compareItems.map(capakeyFromImpactItem)),
    [compareItems]
  );
  const impactCapakeys = useMemo(
    () => new Set(impactItems.map(capakeyFromImpactItem)),
    [impactItems]
  );

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;

    const primarySource = new VectorSource();
    const secondarySource = new VectorSource();
    const referenceLayer = new VectorLayer({
      source: referenceSource ?? undefined,
      visible: showReferenceLayer,
      style: referenceStyle,
      minZoom: OGC_REFERENCE_MIN_ZOOM,
    });
    referenceLayer.setZIndex(8);
    const primaryLayer = new VectorLayer({
      source: primarySource,
      style: primaryStyle,
      zIndex: 19,
    });
    const secondaryLayer = new VectorLayer({
      source: secondarySource,
      style: secondaryStyle,
      zIndex: 20,
    });

    const map = new Map({
      target: divRef.current,
      layers: [
        ...createBaseLayers({
          ...DEFAULT_BASE_LAYER_VISIBILITY,
          [BASE_LAYER_GRB_GRAY]: showGrbBackground,
        }),
        referenceLayer,
        primaryLayer,
        secondaryLayer,
      ],
      view,
    });

    mapRef.current = map;
    referenceLayerRef.current = referenceLayer;
    primaryLayerRef.current = primaryLayer;
    secondaryLayerRef.current = secondaryLayer;
    primarySourceRef.current = primarySource;
    secondarySourceRef.current = secondarySource;

    // The lifecycle map is also embedded in the heritage demo. Its parent
    // can receive its final flex dimensions one frame after map creation.
    // Keep OpenLayers in sync with that late layout measurement.
    const resizeObserver = new ResizeObserver(() => map.updateSize());
    resizeObserver.observe(divRef.current);
    requestAnimationFrame(() => map.updateSize());

    return () => {
      resizeObserver.disconnect();
      if (drawRef.current) {
        map.removeInteraction(drawRef.current);
      }
      map.setTarget(undefined);
      mapRef.current = null;
      referenceLayerRef.current = null;
      primaryLayerRef.current = null;
      secondaryLayerRef.current = null;
      primarySourceRef.current = null;
      secondarySourceRef.current = null;
    };
  }, [view]);

  useEffect(() => {
    if (!referenceLayerRef.current) return;
    referenceLayerRef.current.setSource(referenceSource ?? null);
  }, [referenceSource]);

  useEffect(() => {
    if (!primaryLayerRef.current) return;
    primaryLayerRef.current.setStyle(primaryStyle);
  }, [primaryStyle]);

  useEffect(() => {
    if (!secondaryLayerRef.current) return;
    secondaryLayerRef.current.setStyle(secondaryStyle);
  }, [secondaryStyle]);

  useEffect(() => {
    if (!referenceLayerRef.current) return;
    referenceLayerRef.current.setVisible(showReferenceLayer);
  }, [showReferenceLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const grbLayer = map
      .getLayers()
      .getArray()
      .find((layer) => layer.get(BASE_LAYER_KEY) === BASE_LAYER_GRB_GRAY);
    grbLayer?.setVisible(showGrbBackground);
  }, [showGrbBackground]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.updateSize();
    const frame = requestAnimationFrame(() => map.updateSize());
    return () => cancelAnimationFrame(frame);
  }, [primaryGeometry, secondaryGeometry]);

  useEffect(() => {
    setSingleGeometryFeature(primarySourceRef.current, primaryGeometry, format);
    setSingleGeometryFeature(secondarySourceRef.current, secondaryGeometry, format);
  }, [format, primaryGeometry, secondaryGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    const source = drawEnabled ? secondarySourceRef.current : null;
    if (!map || !source || drawRequestToken === undefined) return;
    if (drawRequestToken === lastDrawTokenRef.current) return;
    lastDrawTokenRef.current = drawRequestToken;

    if (drawRef.current) {
      map.removeInteraction(drawRef.current);
      drawRef.current = null;
    }

    const draw = new Draw({
      source,
      type: "Polygon",
    });

    draw.on("drawstart", () => {
      source.clear();
    });

    draw.on("drawend", (event) => {
      const geometry = event.feature.getGeometry();
      if (!geometry || !onDrawn) return;
      const nextGeometry = format.writeGeometryObject(geometry, {
        dataProjection: "EPSG:31370",
        featureProjection: "EPSG:31370",
      }) as Geometry;
      onDrawn(nextGeometry);
    });

    drawRef.current = draw;
    map.addInteraction(draw);
  }, [drawEnabled, drawRequestToken, format, onDrawn]);

  return (
    <section className="lifecycle-map-split-pane">
      <div className="lifecycle-map-split-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <div className="lifecycle-map-header-meta">
          <span className="lifecycle-map-crs">EPSG:31370</span>
          {loading && <span className="lifecycle-map-badge">herberekenen</span>}
        </div>
      </div>
      <div ref={divRef} className="map-container" />
      <div className="lifecycle-map-legend">
        <span>{primaryLabel}</span>
        <span>{secondaryLabel}</span>
      </div>
      <div className={`lifecycle-map-impact${loading ? " is-loading" : ""}`}>
        <div className="lifecycle-map-impact-block">
          <strong>{impactTitle}</strong>
          <span className="lifecycle-map-impact-context">t.o.v. {impactContextLabel}</span>
          <div className="lifecycle-map-impact-list">
            {impactItems.length > 0 ? (
              impactItems.map((item) => (
                <span key={item} className="lifecycle-map-impact-chip">
                  {item}
                </span>
              ))
            ) : (
              <span className="lifecycle-chip">geen CAPAKEYs</span>
            )}
          </div>
        </div>
        <div className="lifecycle-map-impact-block">
          <strong>Verschil t.o.v. {compareTitle}</strong>
          <div className="lifecycle-map-impact-list">
            {impactItems.filter((item) => !compareCapakeys.has(capakeyFromImpactItem(item))).length > 0 ? (
              impactItems
                .filter((item) => !compareCapakeys.has(capakeyFromImpactItem(item)))
                .map((item) => (
                  <span key={item} className="lifecycle-map-impact-chip is-added">
                    Alleen hier: {item}
                  </span>
                ))
            ) : (
              <span className="lifecycle-chip">geen extra CAPAKEYs</span>
            )}
            {compareItems.filter((item) => !impactCapakeys.has(capakeyFromImpactItem(item))).length > 0 &&
              compareItems
                .filter((item) => !impactCapakeys.has(capakeyFromImpactItem(item)))
                .map((item) => (
                  <span key={item} className="lifecycle-map-impact-chip is-removed">
                    Niet hier: {item}
                  </span>
                ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function GeoLifecycleMap({
  variant,
  view,
  referenceCollectionId,
  showReferenceLayer,
  showGrbBackground,
  originalGeometry,
  managedGeometry,
  proposalGeometry,
  draftGeometry,
  unmanagedImpactItems,
  managedImpactItems,
  impactContextLabel,
  loading,
  drawRequestToken,
  onDrawn,
  actionContent,
}: Props) {
  const sharedView = view;
  const fitFormat = useMemo(() => new GeoJSON(), []);
  const referenceSource = useMemo(
    () => createReferenceSource(referenceCollectionId),
    [referenceCollectionId]
  );
  const fitSignatureRef = useRef<string>("");

  useEffect(() => {
    const nextSignature = JSON.stringify({
      variant,
      referenceCollectionId: referenceCollectionId ?? "",
      originalGeometry: originalGeometry ?? null,
      managedGeometry: managedGeometry ?? null,
      proposalGeometry: proposalGeometry ?? null,
      draftGeometry: draftGeometry ?? null,
    });
    if (nextSignature === fitSignatureRef.current) {
      return;
    }
    fitSignatureRef.current = nextSignature;
    fitMapToGeometries(sharedView, fitFormat, [
      originalGeometry,
      managedGeometry,
      proposalGeometry,
      draftGeometry,
    ]);
  }, [
    draftGeometry,
    fitFormat,
    managedGeometry,
    originalGeometry,
    proposalGeometry,
    referenceCollectionId,
    sharedView,
    variant,
  ]);

  return (
    <div
      className={`lifecycle-map-split lifecycle-map-split-${variant}${loading ? " is-loading" : ""}`}
      aria-busy={loading}
    >
      {loading && (
        <div className="lifecycle-map-loading" role="status">
          <span className="lifecycle-map-loading-spinner" aria-hidden="true" />
          <span>BRDR verwerkt de nieuwe lifecycle-stap…</span>
        </div>
      )}
      {variant === "source" && (
      <LifecycleMapPane
        title="Originele geometrie"
        subtitle="Startpunt van de demo, vóór lifecycle-beheer."
        referenceSource={referenceSource}
        showReferenceLayer={showReferenceLayer}
        showGrbBackground={showGrbBackground}
        view={sharedView}
        primaryGeometry={originalGeometry}
        secondaryGeometry={draftGeometry}
        primaryStyle={originalStyle}
        secondaryStyle={draftStyle}
        primaryLabel="Blauw = originele geometrie"
        secondaryLabel="Oranje = nieuwe draft"
        impactTitle="Originele geometrie"
        impactItems={unmanagedImpactItems}
        impactContextLabel={impactContextLabel}
        compareTitle="beheerd"
        compareItems={managedImpactItems}
        loading={loading}
        drawEnabled
        drawRequestToken={drawRequestToken}
        onDrawn={onDrawn}
      />
      )}
      {variant === "managed" && (
      <LifecycleMapPane
        title="Beheerde geometrie"
        subtitle="Resultaat van lifecycle-beheer en eventuele BRDR-kandidaat."
        referenceSource={referenceSource}
        showReferenceLayer={showReferenceLayer}
        showGrbBackground={showGrbBackground}
        view={sharedView}
        primaryGeometry={managedGeometry}
        secondaryGeometry={proposalGeometry}
        primaryStyle={managedStyle}
        secondaryStyle={proposalStyle}
        primaryLabel="Groen = beheerde baseline"
        secondaryLabel="Rood = BRDR-voorstel"
        impactTitle="Beheerd"
        impactItems={managedImpactItems}
        impactContextLabel={impactContextLabel}
        compareTitle="onbeheerd"
        compareItems={unmanagedImpactItems}
        loading={loading}
      />
      )}
      {variant === "managed" && actionContent && (
        <aside className="lifecycle-map-actions" aria-label="Lifecycle-bediening">
          {actionContent}
        </aside>
      )}
    </div>
  );
}
