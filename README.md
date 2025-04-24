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
curl -X GET http://127.0.0.1:80/ -H accept:application/json
```

### Docs & Example (try-out)
```
Can be found at http://127.0.0.1:80/docs
```