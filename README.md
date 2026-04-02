# BRDR Webservice (Proof of Concept)
Webservice to align thematic features to GRB reference features, based on [brdr](https://github.com/OnroerendErfgoed/brdr).

## Documentation
- GitHub Pages: https://dieuska.github.io/brdr-webservice/


## Quick Start (Docker)
```bash
docker build -f Dockerfile . -t grb_webservice
docker run --rm -p 80:80 --name grb_webservice grb_webservice
```

## Quick Check
```bash
curl -X GET http://127.0.0.1:80/ -H "accept: application/json"
```

## Local API Docs
- Swagger UI: http://127.0.0.1:80/docs
