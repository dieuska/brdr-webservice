# GeoManager Frontend Demo

Interactive visual demo for the GeoManager lifecycle principle:
- one managed geometry in **EPSG:31370**
- fiscal ADP parcels from historical Adpf collections as background
- one BRDR alignment per available ADPF year
- optional user choice when BRDR returns multiple predictions

## Files
- `index.html`
- `app.js`
- `styles.css`

## Run locally
Start the BRDR webservice first, then start a local static server (recommended to avoid browser CORS/file limitations):

```powershell
cd geomanager/frontend
python -m http.server 8080
```

Open:
- `http://localhost:8080`

## How it works
- The app starts from the first built-in sample polygon.
- It discovers the available historical `AdpfYYYY` collections.
- For every collection, it calls `POST /aligner` with the previous lifecycle geometry and that ADPF collection as the OGC reference.
- The selected BRDR result becomes the managed geometry for the next year.
- When multiple predictions are returned, the user is asked which prediction to use.
- The slider shows the resulting lifecycle frames; the ADPF background is refreshed for the selected frame.

## Notes
- BRDR itself still runs in the webservice; there is no separate lifecycle backendscript or pre-generated lifecycle artifact involved.
- For many historical collections, the lifecycle run can take time because it performs one BRDR request per collection.
- For large map extents, parcel loading may be heavy; use the reload button after zooming.
