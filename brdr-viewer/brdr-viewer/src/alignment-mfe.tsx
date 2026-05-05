import { mountAlignmentMfe } from "./alignmentMfeApp";
import "./index.css";
import "./App.css";
import "ol/ol.css";
import "./projections";

mountAlignmentMfe({
  max_relevant_distance: 10.0,
  relevant_distance_step: 0.2,
});
