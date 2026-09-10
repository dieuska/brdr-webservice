import { Component, useState, type ErrorInfo, type FormEvent, type ReactNode } from "react";
import GeoLifecycleManagerApp from "../geolifecycle/GeoLifecycleManagerApp";
import { fetchHeritageObject, type HeritageObject } from "./heritageApi";
import "./HeritageLifecycleManager.css";

const DEFAULT_URI = "https://inventaris.onroerenderfgoed.be/aanduidingsobjecten/120607";

class HeritageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("Erfgoed-lifecyclemodule kon niet worden weergegeven", error);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="heritage-runtime-error" role="alert">
          <strong>De lifecyclemodule kon niet worden weergegeven.</strong>
          <span>{this.state.error.message}</span>
          <button type="button" onClick={() => window.location.reload()}>Pagina opnieuw laden</button>
        </section>
      );
    }
    return this.props.children;
  }
}

export default function HeritageLifecycleManagerApp() {
  const [uri, setUri] = useState(DEFAULT_URI);
  const [object, setObject] = useState<HeritageObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadObject(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const nextObject = await fetchHeritageObject(uri);
      setObject(nextObject);
    } catch (reason) {
      setObject(null);
      setError(reason instanceof Error ? reason.message : "Onbekende fout bij het laden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="heritage-page">
      <section className="heritage-selector">
        <div>
          <a className="viewer-home-link" href={import.meta.env.BASE_URL}>← Demo-overzicht</a>
          <p className="heritage-kicker">Agentschap Onroerend Erfgoed</p>
          <h1>Automatische actualisatie van erfgoedafbakening</h1>
          <p>Laad een aanduidingsobject uit de Inventaris en volg hoe BRDR de afbakening doorheen opeenvolgende referentieversies beheert.</p>
        </div>
        <form onSubmit={(event) => void loadObject(event)} className="heritage-uri-form">
          <label htmlFor="heritage-uri">URI van het erfgoedobject</label>
          <div className="heritage-uri-row">
            <input id="heritage-uri" value={uri} onChange={(event) => setUri(event.target.value)} placeholder={DEFAULT_URI} />
            <button type="submit" disabled={loading || !uri.trim()}>{loading ? "Laden…" : "Object laden"}</button>
          </div>
          <small>Bijvoorbeeld aanduidingsobject 120607. Je kunt hier een andere URI invullen.</small>
        </form>
      </section>
      {error && <div className="heritage-load-error" role="alert">{error}</div>}
      {object ? (
        <HeritageErrorBoundary>
          <GeoLifecycleManagerApp
          key={object.uri}
          demoName={object.title}
          demoEyebrow="Erfgoedobject · lifecyclemanagement"
          compactSubtitle="Erfgoedafbakening doorheen de tijd"
          demoIntro={`Beheer de afbakening van ${object.title} automatisch doorheen opeenvolgende AdpF-versies. BRDR signaleert wijzigingen en vraagt alleen een review wanneer automatische actualisatie niet volstaat.`}
          initialGeometry={object.geometry}
          initialGeometryLabel="Aanduidingsobject geladen"
          showPresetControls={false}
          />
        </HeritageErrorBoundary>
      ) : (
        <section className="heritage-empty-state"><strong>Laad een erfgoedobject om de lifecycle te starten.</strong><span>De kaart en workflow verschijnen hier zodra de geometrie beschikbaar is.</span></section>
      )}
    </main>
  );
}
