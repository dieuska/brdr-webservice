import proj4 from "proj4";
import { register } from "ol/proj/proj4";

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
register(proj4);
