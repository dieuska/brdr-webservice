import { mountAlignmentMfe } from "./alignmentMfeApp";
import "./index.css";
import "./App.css";
import "ol/ol.css";
import "./projections";

mountAlignmentMfe({
  reference_loader: "wfs",
  reference_url: "https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0",
  reference_id_property: "identificatieLokaalID",
  reference_typename: "kadastralekaart:Perceel",
  max_relevant_distance: 10.0,
  relevant_distance_step: 0.2,
}, "BRK/WFS alignering (Nederland)", "Referentie via PDOK BRK percelen (WFS)");
