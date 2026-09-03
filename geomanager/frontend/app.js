import OLMap from "https://esm.sh/ol@10.6.1/Map.js";
import View from "https://esm.sh/ol@10.6.1/View.js";
import GeoJSON from "https://esm.sh/ol@10.6.1/format/GeoJSON.js";
import TileLayer from "https://esm.sh/ol@10.6.1/layer/Tile.js";
import VectorLayer from "https://esm.sh/ol@10.6.1/layer/Vector.js";
import TileWMS from "https://esm.sh/ol@10.6.1/source/TileWMS.js";
import VectorSource from "https://esm.sh/ol@10.6.1/source/Vector.js";
import { Fill, Stroke, Style } from "https://esm.sh/ol@10.6.1/style.js";
import { register } from "https://esm.sh/ol@10.6.1/proj/proj4.js";
import { get as getProjection } from "https://esm.sh/ol@10.6.1/proj.js";
import proj4 from "https://esm.sh/proj4@2.11.0";

const GRB_WMS_URL = "https://geo.api.vlaanderen.be/GRB/wms";
const GRB_WMS_LAYER = "GRB_BSK";
const ADPF_ENDPOINT_CANDIDATES = [
  {
    collectionsUrl: "https://geo.api.vlaanderen.be/Adpf/ogc/features/v1/collections?f=application%2Fjson",
    itemsBase: "https://geo.api.vlaanderen.be/Adpf/ogc/features/v1/collections",
  },
  {
    collectionsUrl: "https://geo.api.vlaanderen.be/Adpf/ogc/features/v1/collections?f=json",
    itemsBase: "https://geo.api.vlaanderen.be/Adpf/ogc/features/v1/collections",
  },
];
const ADPF_DEFAULT_COLLECTION_ID = "Adpf";
const BRDR_API_BASE = ["5173", "8080", "8765"].includes(window.location.port)
  ? "http://127.0.0.1:80"
  : window.location.origin;
const FALLBACK_MANAGED_OBJECTS = [
  {
    id: "obj_1",
    yearA: [
      [172980, 174380], [173140, 174380], [173140, 174520], [172980, 174520], [172980, 174380],
    ],
    yearB: [
      [172992, 174388], [173152, 174390], [173148, 174532], [172988, 174528], [172992, 174388],
    ],
    decision: "fallback_demo",
  },
  {
    id: "obj_2",
    yearA: [
      [173220, 174300], [173380, 174300], [173390, 174430], [173230, 174438], [173220, 174300],
    ],
    yearB: [
      [173230, 174308], [173392, 174306], [173402, 174442], [173236, 174450], [173230, 174308],
    ],
    decision: "fallback_demo",
  },
  {
    id: "obj_3",
    yearA: [
      [173050, 174180], [173200, 174180], [173190, 174270], [173042, 174266], [173050, 174180],
    ],
    yearB: [
      [173060, 174188], [173212, 174190], [173202, 174280], [173050, 174278], [173060, 174188],
    ],
    decision: "fallback_demo",
  },
];

const statusEl = document.getElementById("status");
const sliderEl = document.getElementById("timeSlider");
const progressEl = document.getElementById("progressLabel");
const yearAEl = document.getElementById("yearA");
const yearBEl = document.getElementById("yearB");
const reloadBtn = document.getElementById("reloadParcels");
const runLifecycleBtn = document.getElementById("runLifecycle");

let activeCollectionsBase = ADPF_ENDPOINT_CANDIDATES[0].itemsBase;
let managedObjects = FALLBACK_MANAGED_OBJECTS;
let lifecycleFrames = [];
let lifecycleCollections = [];
let activeLifecycleParcelCollection = null;
let backgroundLayer;

function setStatus(msg, append = true) {
  if (!append) statusEl.textContent = msg;
  else statusEl.textContent = `${statusEl.textContent}\n${msg}`.trim();
  statusEl.scrollTop = statusEl.scrollHeight;
}

const baseStyle = new Style({
  stroke: new Stroke({ color: "#1e63af", width: 2, lineDash: [6, 4] }),
  fill: new Fill({ color: "rgba(30,99,175,0.12)" }),
});

const updatedStyle = new Style({
  stroke: new Stroke({ color: "#dc322f", width: 2, lineDash: [4, 3] }),
  fill: new Fill({ color: "rgba(220,50,47,0.10)" }),
});

const currentStyle = new Style({
  stroke: new Stroke({ color: "#007f5f", width: 2.5 }),
  fill: new Fill({ color: "rgba(0,127,95,0.25)" }),
});

const parcelStyle = new Style({
  stroke: new Stroke({ color: "rgba(110,135,152,0.65)", width: 1 }),
  fill: new Fill({ color: "rgba(88,111,124,0.12)" }),
});

const parcelSource = new VectorSource();
const parcelLayer = new VectorLayer({ source: parcelSource, style: parcelStyle });

const baseSource = new VectorSource();
const baseLayer = new VectorLayer({ source: baseSource, style: baseStyle });

const updatedSource = new VectorSource();
const updatedLayer = new VectorLayer({ source: updatedSource, style: updatedStyle });

const currentSource = new VectorSource();
const currentLayer = new VectorLayer({ source: currentSource, style: currentStyle });

let map;

const geojsonFormat = new GeoJSON();

function geometryFeature(geometry, id = "lifecycle-object") {
  return {
    type: "Feature",
    id,
    properties: {},
    geometry,
  };
}

async function fetchBrdrPrediction(geometry, collectionId) {
  const body = {
    featurecollection: {
      type: "FeatureCollection",
      features: [geometryFeature({
        type: "Polygon",
        coordinates: [geometry],
      })],
    },
    params: {
      crs: "EPSG:31370",
      reference_loader: "ogc_feature_api",
      reference_url: "https://geo.api.vlaanderen.be/Adpf/ogc/features/v1/collections",
      reference_id_property: "CAPAKEY",
      reference_collection: collectionId,
      reference_partition: 1000,
      reference_limit: 10000,
      grb_type: "GRB - ADP - administratief perceel",
      full_reference_strategy: "prefer_full_reference",
      od_strategy: "SNAP_ALL_SIDE",
      snap_strategy: "PREFER_VERTICES",
      max_relevant_distance: 10,
      relevant_distance_step: 0.2,
      processor: "AlignerGeometryProcessor",
    },
  };

  const response = await fetch(`${BRDR_API_BASE}/aligner?result_mode=predictions&include_metadata=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`BRDR ${response.status}: ${detail.slice(0, 240)}`);
  }
  return response.json();
}

function orderedSeriesKeys(series) {
  return Object.keys(series ?? {}).sort((a, b) => Number(a) - Number(b));
}

async function choosePrediction(collection, predictionKeys, response) {
  if (predictionKeys.length <= 1) return predictionKeys[0];

  const choices = predictionKeys.map((key, index) => {
    const score = Number(response.prediction_scores?.[key] ?? 0).toFixed(2);
    return `${index + 1}: ${key} m (score ${score})`;
  });
  const answer = window.prompt(
    `BRDR vond meerdere predictions voor ${collection.year ?? collection.id}. Kies een resultaat:\n\n${choices.join("\n")}\n\nGeef het nummer, of Annuleren voor de beste score.`,
    "1"
  );
  const selectedIndex = Number.parseInt(answer ?? "1", 10) - 1;
  return predictionKeys[selectedIndex] ?? predictionKeys[0];
}

async function calculateLifecycle(collectionEntries) {
  const initialGeometry = FALLBACK_MANAGED_OBJECTS[0].yearA;
  let currentGeometry = initialGeometry;
  const frames = [{
    year: "Start",
    collectionId: null,
    geometry: initialGeometry,
    previousGeometry: initialGeometry,
    decision: "initial",
    predictionCount: 0,
    chosenDistance: null,
  }];

  for (const collection of collectionEntries) {
    setStatus(`BRDR alignment voor ${collection.year ?? collection.id}...`);
    const response = await fetchBrdrPrediction(currentGeometry, collection.id);
    const seriesKeys = orderedSeriesKeys(response.series);
    const predictionKeys = seriesKeys.filter((key) => response.predictions?.[key]);
    const candidates = predictionKeys.length ? predictionKeys : seriesKeys;
    if (!candidates.length) {
      setStatus(`Geen BRDR-resultaat voor ${collection.year ?? collection.id}.`);
      continue;
    }

    const chosenKey = await choosePrediction(collection, candidates, response);
    const nextGeometry = response.series[chosenKey]?.result;
    if (!nextGeometry || nextGeometry.type !== "Polygon") {
      setStatus(`Resultaat voor ${collection.year ?? collection.id} is geen bruikbare Polygon.`);
      continue;
    }

    currentGeometry = nextGeometry.coordinates[0];
    frames.push({
      year: collection.year ?? collection.id,
      collectionId: collection.id,
      geometry: currentGeometry,
      previousGeometry: frames[frames.length - 1].geometry,
      decision: predictionKeys.length ? "prediction" : "best_available_result",
      predictionCount: predictionKeys.length,
      chosenDistance: chosenKey,
    });
  }
  return frames;
}

function renderLifecycleFrame(index) {
  const frame = lifecycleFrames[index];
  if (!frame) return;
  managedObjects = [{
    id: "lifecycle-object",
    yearA: frame.previousGeometry,
    yearB: frame.geometry,
    decision: frame.decision,
    reason: frame.chosenDistance ? `BRDR ${frame.chosenDistance} m` : "initial",
  }];
  renderManagedLayers(100);
  updateProgressUI(index, lifecycleFrames.length);
  setStatus(`Getoond: ${frame.year} · ${frame.predictionCount} prediction(s) · ${frame.decision}.`);
  if (frame.collectionId && frame.collectionId !== activeLifecycleParcelCollection) {
    activeLifecycleParcelCollection = frame.collectionId;
    fetchParcelsForExtent(frame.collectionId).catch((err) => {
      setStatus(`ADPF-laag voor ${frame.year} kon niet worden geladen (${err.message}).`);
    });
  }
}

function ensureProjection() {
  proj4.defs(
    "EPSG:31370",
    "+proj=lcc +lat_0=90 +lon_0=4.36748666666667 +lat_1=51.1666672333333 +lat_2=49.8333339 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +towgs84=106.8686,-52.2978,103.7239,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs +type=crs"
  );
  register(proj4);
  const projection = getProjection("EPSG:31370");
  if (!projection) {
    throw new Error("EPSG:31370 projection could not be registered");
  }
  projection.setExtent([9928, 66928, 272072, 329072]);
}

function ensureMap() {
  if (map) {
    map.updateSize();
    return map;
  }
  ensureProjection();
  map = new OLMap({
    target: "map",
    layers: [parcelLayer, baseLayer, updatedLayer, currentLayer],
    view: new View({
      projection: "EPSG:31370",
      center: [173300, 174250],
      zoom: 13,
    }),
  });
  map.on("moveend", async () => {
    // Intentionally manual to keep the demo light.
  });
  return map;
}

async function ensureBackgroundLayer() {
  if (backgroundLayer) {
    return backgroundLayer;
  }
  backgroundLayer = new TileLayer({
    source: new TileWMS({
      url: GRB_WMS_URL,
      params: {
        SERVICE: "WMS",
        VERSION: "1.3.0",
        REQUEST: "GetMap",
        LAYERS: GRB_WMS_LAYER,
        CRS: "EPSG:31370",
        FORMAT: "image/png",
        TRANSPARENT: false,
      },
      serverType: "geoserver",
      projection: "EPSG:31370",
      crossOrigin: "anonymous",
    }),
    opacity: 1,
  });
  map.getLayers().insertAt(0, backgroundLayer);
  return backgroundLayer;
}

function polygonFeature(coords, properties = {}) {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
  };
}

function interpolateCoords(a, b, t) {
  return a.map((pt, i) => {
    const q = b[i];
    return [pt[0] + (q[0] - pt[0]) * t, pt[1] + (q[1] - pt[1]) * t];
  });
}

function renderManagedLayers(progress) {
  const t = progress / 100;
  baseSource.clear();
  updatedSource.clear();
  currentSource.clear();

  const baseFeatures = managedObjects.map((o) => polygonFeature(o.yearA, { id: o.id, state: "base" }));
  const updatedFeatures = managedObjects.map((o) =>
    polygonFeature(o.yearB, { id: o.id, state: "updated", decision: o.decision, reason: o.reason })
  );
  const currentFeatures = managedObjects.map((o) =>
    polygonFeature(interpolateCoords(o.yearA, o.yearB, t), {
      id: o.id,
      state: "current",
      lifecycle_progress_pct: progress,
      decision: o.decision,
      reason: o.reason,
    })
  );

  baseSource.addFeatures(
    geojsonFormat.readFeatures(
      { type: "FeatureCollection", features: baseFeatures },
      { dataProjection: "EPSG:31370", featureProjection: "EPSG:31370" }
    )
  );
  updatedSource.addFeatures(
    geojsonFormat.readFeatures(
      { type: "FeatureCollection", features: updatedFeatures },
      { dataProjection: "EPSG:31370", featureProjection: "EPSG:31370" }
    )
  );
  currentSource.addFeatures(
    geojsonFormat.readFeatures(
      { type: "FeatureCollection", features: currentFeatures },
      { dataProjection: "EPSG:31370", featureProjection: "EPSG:31370" }
    )
  );

  baseLayer.setOpacity(0.55);
  updatedLayer.setOpacity(0.5);
  currentLayer.setOpacity(1);

  const extent = currentSource.getExtent();
  if (extent && extent.every((value) => Number.isFinite(value))) {
    map.getView().fit(extent, { padding: [36, 36, 36, 36], maxZoom: 16, duration: 0 });
  }
}

function extractYearLabel(collection) {
  const id = String(collection?.id ?? "");
  const title = String(collection?.title ?? "");
  const idMatch = id.match(/(19|20)\d{2}/);
  if (idMatch) return idMatch[0];
  const titleMatch = title.match(/(19|20)\d{2}/);
  if (titleMatch) return titleMatch[0];
  return null;
}

async function fetchCollections() {
  let lastErr = null;
  for (const candidate of ADPF_ENDPOINT_CANDIDATES) {
    try {
      const response = await fetch(candidate.collectionsUrl);
      if (!response.ok) throw new Error(`status ${response.status}`);
      const data = await response.json();
      const raw = Array.isArray(data?.collections) ? data.collections : [];
      const entries = raw
        .map((collection) => ({
          id: collection.id,
          year: extractYearLabel(collection),
          title: collection.title ?? "",
        }))
        .filter((entry) => entry.id);
      if (entries.length) {
        activeCollectionsBase = candidate.itemsBase;
        entries.sort((a, b) => {
          const ay = Number(a.year ?? 0);
          const by = Number(b.year ?? 0);
          return ay - by || a.id.localeCompare(b.id);
        });
        setStatus(`Using collections endpoint: ${candidate.collectionsUrl}`);
        return entries;
      }
      lastErr = new Error(`No year-based Adpf collections in response from ${candidate.collectionsUrl}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Unable to load Adpf collections. Last error: ${lastErr?.message ?? "unknown"}`);
}

function fillYearSelects(collectionEntries) {
  yearAEl.innerHTML = "";
  yearBEl.innerHTML = "";
  for (const entry of collectionEntries) {
    const id = entry.id;
    const label = entry.year ? `${entry.year} (${id})` : (entry.title || id);
    const a = document.createElement("option");
    a.value = id;
    a.textContent = label;
    yearAEl.appendChild(a);

    const b = document.createElement("option");
    b.value = id;
    b.textContent = label;
    yearBEl.appendChild(b);
  }

  if (collectionEntries.length >= 2) {
    yearAEl.value = collectionEntries[collectionEntries.length - 2].id;
    yearBEl.value = collectionEntries[collectionEntries.length - 1].id;
  } else if (collectionEntries.length === 1) {
    yearAEl.value = collectionEntries[0].id;
    yearBEl.value = collectionEntries[0].id;
  }
}

function fallbackCollections() {
  return [{ id: ADPF_DEFAULT_COLLECTION_ID, year: null, title: "Administratieve percelen" }];
}

async function fetchParcelsForExtent(collectionId) {
  if (!map) {
    throw new Error("Map is not initialized");
  }
  const bbox = map.getView().calculateExtent(map.getSize()).join(",");
  const params = new URLSearchParams({
    f: "application/json",
    limit: "2500",
    bbox,
    crs: "http://www.opengis.net/def/crs/EPSG/0/31370",
    "bbox-crs": "http://www.opengis.net/def/crs/EPSG/0/31370",
  });

  let lastErr = null;
  const bases = [activeCollectionsBase, ...ADPF_ENDPOINT_CANDIDATES.map((candidate) => candidate.itemsBase)];
  const effectiveCollectionId = collectionId || ADPF_DEFAULT_COLLECTION_ID;
  for (const base of [...new Set(bases)]) {
    const url = `${base}/${encodeURIComponent(effectiveCollectionId)}/items?${params.toString()}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`status ${response.status}`);
      const geojson = await response.json();
      const features = geojsonFormat.readFeatures(geojson, {
        dataProjection: "EPSG:31370",
        featureProjection: "EPSG:31370",
      });
      parcelSource.clear();
      parcelSource.addFeatures(features);
      activeCollectionsBase = base;
      setStatus(`Loaded ${features.length} parcels from ${effectiveCollectionId} via ${base}.`);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Items request failed (${effectiveCollectionId}): ${lastErr?.message ?? "unknown"}`);
}

function currentReferenceCollection(progress) {
  return progress < 50 ? yearAEl.value : yearBEl.value;
}

async function refreshParcelsUsingProgress(progress) {
  const collection = currentReferenceCollection(progress);
  if (!collection) return;
  await fetchParcelsForExtent(collection);
}

function updateProgressUI(value, frameCount = 101) {
  if (frameCount <= 1) {
    progressEl.textContent = "0%";
    return;
  }
  progressEl.textContent = `${Math.round((value / (frameCount - 1)) * 100)}%`;
}

sliderEl.addEventListener("input", async (event) => {
  const value = Number(event.target.value);
  if (lifecycleFrames.length > 0) {
    renderLifecycleFrame(value);
    return;
  }
  updateProgressUI(value);
  renderManagedLayers(value);
});

reloadBtn.addEventListener("click", async () => {
  try {
    await refreshParcelsUsingProgress(Number(sliderEl.value));
  } catch (err) {
    setStatus(`Reload failed: ${err.message}`);
  }
});

runLifecycleBtn.addEventListener("click", async () => {
  if (lifecycleCollections.length === 0 || runLifecycleBtn.disabled) return;
  runLifecycleBtn.disabled = true;
  lifecycleFrames = [];
  sliderEl.disabled = true;
  try {
    lifecycleFrames = await calculateLifecycle(lifecycleCollections);
    sliderEl.min = "0";
    sliderEl.max = String(Math.max(lifecycleFrames.length - 1, 0));
    sliderEl.value = "0";
    sliderEl.disabled = lifecycleFrames.length <= 1;
    renderLifecycleFrame(0);
    setStatus(`Lifecycle klaar: ${lifecycleFrames.length - 1} ADPF-jaarstappen verwerkt.`);
  } catch (err) {
    lifecycleFrames = [];
    sliderEl.min = "0";
    sliderEl.max = "100";
    sliderEl.value = "0";
    sliderEl.disabled = false;
    setStatus(`Lifecycle afgebroken (${err.message}).`);
  } finally {
    runLifecycleBtn.disabled = false;
  }
});

yearAEl.addEventListener("change", async () => {
  if (Number(sliderEl.value) < 50) {
    await refreshParcelsUsingProgress(Number(sliderEl.value));
  }
});

yearBEl.addEventListener("change", async () => {
  if (Number(sliderEl.value) >= 50) {
    await refreshParcelsUsingProgress(Number(sliderEl.value));
  }
});

async function init() {
  try {
    setStatus("Loading Adpf collections...", false);
    ensureMap();
    try {
      await ensureBackgroundLayer();
      setStatus("GRB WMS background loaded in EPSG:31370.");
    } catch (err) {
      setStatus(`GRB WMS background unavailable (${err.message}).`);
    }
    let collections = [];
    try {
      collections = await fetchCollections();
    } catch (err) {
      setStatus(`Collections discovery failed (${err.message}). Using fallback years.`);
    }
    if (!collections.length) {
      collections = fallbackCollections();
      setStatus(`Fallback collections loaded: ${collections.map((collection) => collection.id).join(", ")}`);
    }
    fillYearSelects(collections);
    lifecycleCollections = collections;
    managedObjects = [FALLBACK_MANAGED_OBJECTS[0]];
    renderManagedLayers(0);
    updateProgressUI(0);
    try {
      await refreshParcelsUsingProgress(0);
    } catch (err) {
      setStatus(`Parcel background unavailable (${err.message}). Demo geometries remain visible.`);
    }
    setStatus("Klaar. Start de BRDR-lifecycle om de geometrie doorheen de ADPF-jaren te volgen.");
  } catch (err) {
    setStatus(`Initialization error: ${err.message}`);
  }
}

init();
