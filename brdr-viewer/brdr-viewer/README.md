# BRDR Viewer

Een React + TypeScript applicatie voor het visualiseren van BRDR-stappen op een kaart (OpenLayers) met een tijdlijn en grafiek.

De app toont:
- een OpenLayers kaart met basislagen en BRDR-overlays
- een zijpaneel met:
  - een tijdlijn
  - een slider om door stappen te navigeren
  - een grafiek met oppervlaktes (diffs)

---

## 🚀 Getting started (voor nieuwe developers)

### Vereisten
Zorg dat je dit geïnstalleerd hebt:
- **Node.js** (>= 18 aanbevolen)
- **npm** (wordt meegeleverd met Node)

Controleer:
```bash
node -v
npm -v
```

#### Installeer dependencies:
npm install

#### Start de development server:
npm run dev

#### Open de app in je browser:
http://localhost:5173



## Input data
De viewer laadt data via `POST /actualiser/viewer` van de webservice.

- standaard backend URL: `http://127.0.0.1:80`
- override via env var: `VITE_BRDR_API_BASE_URL`
- request body staat in `src/data/request_body.json`

### Dynamische geometrie
- klik **Teken nieuwe geometrie** in de viewer en teken een polygon op de kaart
- je kan bestaande vertices nadien verslepen (modify)
- klik **Herbereken** om de webservice opnieuw te laten rekenen en de tijdlijn + kaart te updaten

Voorbeeld:
```bash
VITE_BRDR_API_BASE_URL=http://127.0.0.1:80 npm run dev
```
