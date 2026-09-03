GeoManager conceptnota
=====================

1. Idee
-------
GeoManager is een domeinlaag bovenop BRDR die geometrische objecten doorheen de tijd beheert.
Elk object krijgt een levenscyclus (versies + metadata), en GeoManager detecteert automatisch wanneer
onderliggende referenties (bv. GRB/ADP/GBG, OSM, andere referentielagen) veranderen. Op basis daarvan
kan het object automatisch heruitgelijnd worden via BRDR, met controleerbare evaluatie, audit en
optionele goedkeuringsflows.

Kernidee:
- Niet langer "eenmalig aligneren", maar "continu beheren van geometrie-integriteit".
- Referentiewijzigingen worden omgezet naar concrete impact op objecten.
- BRDR wordt de aligneringsmotor binnen een bredere beheercyclus.


2. Doelstellingen
-----------------
2.1 Functionele doelstellingen
- Centraal beheer van objecten met geometrie + business-identiteit.
- Tijdlijn per object: originele toestand, updates, BRDR-voorstellen, finale toestand.
- Automatische impactanalyse bij referentiewijzigingen.
- Automatische of semi-automatische heruitlijning via BRDR.
- Volledige traceerbaarheid: waarom werd een geometrie aangepast, op basis van welke referentieversie.

2.2 Operationele doelstellingen
- Minder manuele GIS-correcties.
- Snellere update-cycli na referentie-updates.
- Kwaliteitsgaranties via regels, thresholds en evaluatiestatussen.
- Herhaalbare, schaalbare pipeline voor meerdere datasets/organisaties.

2.3 Governance doelstellingen
- Duidelijke scheiding tussen "suggested" en "approved" wijzigingen.
- Transparante audittrail (wie/wat/wanneer/waarom).
- Reproduceerbaarheid van resultaten (zelfde input + config => zelfde output).


3. Mogelijkheden
----------------
3.1 Object lifecycle management
- Objectregister met unieke sleutel (business-id).
- Geometrieversies met geldigheidsperiode (valid_from, valid_to).
- Koppeling naar bronattribuutversies en referentieversies.

3.2 Change detection
- Detectie van referentiewijzigingen in een tijdsvenster.
- Impactdetectie: welke objecten kruisen gewijzigde referentie-entiteiten.
- Differentiatie van impacttype:
  - rand-impact (border_distance)
  - interne impact
  - geen impact

3.3 BRDR update-engine
- Scenario's per objecttype (polygon/line/point).
- Config-profielen per domein:
  - od_strategy
  - relevant distance range
  - snap strategy
  - threshold overlap/exclusion
- Predict + evaluate workflow voor beste kandidaat.

3.4 Beslissingslogica
- Automatische acceptatie wanneer confidence hoog genoeg is.
- Markering "to_check" bij twijfelgevallen.
- Bulk-goedkeuring via rulesets of manuele review in GIS/portaal.

3.5 Rapportering en monitoring
- KPI's per run:
  - aantal getroffen objecten
  - auto-geaccepteerd / manueel te controleren
  - gemiddelde geometrieverandering
  - false-positive indicatoren
- Historische trendanalyse van updatekwaliteit.

3.6 Integratie
- Input via OGC API/WFS/PostGIS/GeoJSON.
- Export naar GPKG/GeoJSON/Parquet of terug naar databank.
- Event-driven trigger mogelijk (bv. na referentie-publicatie).


4. Meerwaarde
-------------
4.1 Voor databeheerders
- Minder reactief werk: updates worden proactief gedetecteerd.
- Minder repetitieve manuele correctie.
- Meer focus op uitzonderingen i.p.v. bulk-updates.

4.2 Voor organisatie/data governance
- Betere datakwaliteit en consistentie over tijd.
- Eenduidige, auditeerbare updateprocedure.
- Minder afhankelijkheid van individuele expertenkennis.

4.3 Voor eindgebruikers
- Actuelere geometrieën.
- Minder discrepantie tussen thema-data en officiële referenties.
- Hogere betrouwbaarheid van analyses op die geometrieën.

4.4 Technische meerwaarde
- BRDR wordt herbruikbare "alignment kernel" in een bredere data lifecycle.
- Modulaire opbouw laat meerdere referentiebronnen en domeinen toe.


5. Hoe dit technisch kan werken
-------------------------------
5.1 Logische architectuur
- GeoManager API/Orchestrator
  - start jobs
  - beheert state/status
  - exposeert resultaten
- Change Detection Service
  - haalt referentie-updates op
  - bepaalt impacted object IDs
- BRDR Processing Service
  - draait process/predict/evaluate
  - produceert kandidaat-updates + metrics
- Decision Engine
  - rule-based accept/review/reject
- Storage laag
  - object store (versies)
  - run store (jobs, metrics, logs)
  - reference snapshot metadata

5.2 Datamodel (conceptueel)
- managed_object
  - object_id
  - object_type
  - source_system
  - current_version_id
- managed_object_version
  - version_id
  - object_id
  - geometry
  - properties
  - valid_from, valid_to
  - status (active, superseded, proposed)
  - provenance (run_id, algorithm_version, config_fingerprint)
- reference_snapshot
  - snapshot_id
  - reference_source
  - version_date
  - bbox/hash/metadata
- update_run
  - run_id
  - started_at, finished_at
  - config_profile
  - summary_metrics
- update_decision
  - decision_id
  - version_id_old/new
  - decision (auto_accept, review, reject)
  - reason_code

5.3 End-to-end flow
1. Detecteer nieuwe referentieversie of wijzigingsvenster.
2. Bepaal impacted objecten via spatial intersection + optionele border filter.
3. Voor impacted objecten:
   - laad objectgeometrie
   - laad relevante referentie (preselectie op bbox/buffer)
   - run BRDR process/predict/evaluate
4. Decision engine bepaalt:
   - auto accept
   - twijfelgeval (review queue)
5. Bij acceptatie:
   - schrijf nieuwe objectversie
   - sluit vorige versie af (valid_to)
6. Exporteer metrics, audit en eventuele review-lijsten.

5.4 Beslisregels (voorbeeld)
- Auto-accept als:
  - evaluation in {PREDICTION_UNIQUE, PREDICTION_UNIQUE_AND_FULL_REFERENCE}
  - prediction_score >= X
  - area/length change binnen domeinthreshold
- Review als:
  - TO_CHECK_* evaluaties
  - multiple kandidaten of lage confidence
- Reject/hold als:
  - invalid geometry
  - onverwacht grote verandering buiten beleidsmarge

5.5 Performance-aanpak
- Batch per tile/zone.
- Referentie-preselectie en STRtree-gebruik.
- Parallel verwerking per objectbatch.
- Caching van reference subsets en topology waar relevant.
- Incremental runs (enkel delta i.p.v. volledige herverwerking).

5.6 Kwaliteitsaanpak
- Geometrievalidatie op elke stap.
- Diff-metrics en plausibiliteitschecks.
- Unit/integration tests op beslisregels.
- Benchmark-baseline voor process/predict/evaluate.


6. Implementatiestrategie (gefaseerd)
-------------------------------------
Fase 1: MVP
- Batch-runner die impacted objecten detecteert en BRDR output produceert.
- Opslag van proposed updates + metrics.
- Nog geen auto-accept, enkel review output.

Fase 2: Governance
- Beslisregels + statusmodel + audittrail.
- Auto-accept voor high-confidence cases.
- Review workflow integratie.

Fase 3: Productisatie
- API endpoints, scheduling, monitoring dashboards.
- Multi-tenant/multi-dataset ondersteuning.
- Hardening op performance en foutafhandeling.


7. Risico's en aandachtspunten
------------------------------
- False positives bij complexe geometrieën of minder kwalitatieve brondata.
- Te agressieve auto-accept regels kunnen foutieve updates doorlaten.
- Verschillen tussen referentiebronnen (semantisch, niet enkel geometrisch).
- Nood aan duidelijk ownership-model voor finale goedkeuring.

Mitigaties:
- Conservatieve defaults in decision engine.
- Domeinspecifieke config-profielen.
- Continue calibratie met gelabelde reviewcases.


8. Samenvatting
---------------
GeoManager maakt van BRDR een continue beheermotor voor tijdsgebonden geometrieën.
Het combineert change detection, alignering, evaluatie, besluitvorming en audit in één
herhaalbare keten. Daarmee verschuif je van ad-hoc geometriecorrectie naar structureel,
schaalbaar en transparant geobeheer.
