import proj4 from "proj4";
import { register } from "ol/proj/proj4";
import { get as getProjection } from "ol/proj";

proj4.defs(
  "EPSG:31370",
  "+proj=lcc " +
    "+lat_1=49.8333339 " +
    "+lat_2=51.16666723333333 " +
    "+lat_0=90 " +
    "+lon_0=4.367486666666666 " +
    "+x_0=150000.013 " +
    "+y_0=5400088.438 " +
    "+ellps=intl " +
    "+towgs84=-106.8686,52.2978,-103.7239,0.3366,-0.457,1.8422,-1.2747" +
    "+units=m +no_defs"
);

proj4.defs(
  "EPSG:3812",
  "+proj=lcc " +
    "+lat_0=50.797815 " +
    "+lon_0=4.359215833333333 " +
    "+lat_1=49.833333333333336 " +
    "+lat_2=51.166666666666664 " +
    "+x_0=649328 " +
    "+y_0=665262 " +
    "+ellps=GRS80 " +
    "+units=m +no_defs"
);

proj4.defs(
  "EPSG:28992",
  "+proj=sterea " +
    "+lat_0=52.15616055555555 " +
    "+lon_0=5.38763888888889 " +
    "+k=0.9999079 " +
    "+x_0=155000 " +
    "+y_0=463000 " +
    "+ellps=bessel " +
    "+towgs84=565.4171,50.3319,465.5524,1.9342,-1.6677,9.1019,4.0725 " +
    "+units=m +no_defs"
);
register(proj4);

const rdNew = getProjection("EPSG:28992");
if (rdNew) {
  // RD New bounds in meters (EPSG registry) + matching lon/lat world extent.
  rdNew.setExtent([646.36, 308975.28, 284347.56, 636456.31]);
  rdNew.setWorldExtent([3.2, 50.75, 7.22, 53.7]);
}
