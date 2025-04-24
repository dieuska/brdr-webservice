# brdr-webservice (proof-of-concept)
webservice to align thematic features to reference features (GRB) , based on  [brdr](<https://github.com/OnroerendErfgoed/brdr>) 

## build.sh
```
docker build -f Dockerfile . -t grb_webservice
```
## start.sh
```
docker run --rm -p 80:80 --name grb_webservice grb_webservice
```

### Webservice available
```
curl -X 'GET' 'http://0.0.0.0:80/' -H 'accept: application/json'
```

### Docs
```
curl -X GET 'http://0.0.0.0:80/docs'
```
### Example
```
curl -X 'POST' \
  'http://0.0.0.0:80/actualiser' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "featurecollection": {
    "features": [
      {
        "geometry": {
          "coordinates": [
            [
              [
                [
                  174111.5042,
                  179153.9243
                ],
                [
                  174110.0614,
                  179154.1094
                ],
                [
                  174068.867,
                  179159.3947
                ],
                [
                  174068.8661,
                  179159.4262
                ],
                [
                  174068.8626,
                  179159.5573
                ],
                [
                  174073.7483,
                  179188.9357
                ],
                [
                  174120.4387,
                  179180.3235
                ],
                [
                  174116.1333,
                  179157.2025
                ],
                [
                  174111.54901,
                  179153.956007
                ],
                [
                  174111.5042,
                  179153.9243
                ]
              ]
            ]
          ],
          "type": "MultiPolygon"
        },
        "id": "2",
        "properties": {},
        "type": "Feature"
      }
    ],
    "type": "FeatureCollection"
  },
  "params": {
    "crs": "EPSG:31370",
    "grb_type": "adp",
    "prediction_strategy": "prefer_full"
  }
}'
```
