import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import "./projections";
import type { DemoGeometryItem } from "./components/demo/DemoMapViewer";
import { BRDR_CRS_28992 } from "./components/alignment/contracts";

const BRK_GEOMETRIES: DemoGeometryItem[] = [
  {
    id: "geom-0",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [115958.043, 401990.136],
        [115944.196, 401967.996],
        [115950.221, 401965.017],
        [115954.617, 401962.583],
        [115956.234, 401962.629],
        [115970.014, 401984.533],
        [115958.043, 401990.136],
      ]],
    },
  },
  {
    id: "geom-1",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [115976.702, 402058.65],
        [115986.136, 402053.644],
        [115990.524, 402051.24],
        [115992.376, 402050.25],
        [116000.037, 402046.874],
        [116008.236, 402058.965],
        [115982.402, 402071.255],
        [115976.702, 402058.65],
      ]],
    },
  },
  {
    id: "geom-2",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [115976.879, 402059.113],
        [115971.055, 402051.714],
        [115966.488, 402043.421],
        [115961.906, 402035.101],
        [115957.324, 402027.682],
        [115953.934, 402018.447],
        [115947.926, 402008.716],
        [115952.977, 402006.756],
        [115959.471, 402018.011],
        [115966.434, 402029.772],
        [115974.43, 402042.09],
        [115980.245, 402054.888],
        [115987.214, 402066.62],
        [115992.544, 402077.253],
        [115978.798, 402083.719],
        [115980.691, 402083.778],
        [115981.799, 402082.384],
        [115983.04, 402078.839],
        [115983.414, 402074.636],
        [115982.737, 402072.929],
        [115976.879, 402059.113],
      ]],
    },
  },
];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App
      alignmentMfePath="alignment-mfe-wfs.html"
      demoCrs={BRDR_CRS_28992}
      initialGeometries={BRK_GEOMETRIES}
      showGrbReferenceControls={false}
    />
  </StrictMode>
);
