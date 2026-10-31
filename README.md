# Klar - Wetter ohne Werbung

Persönliche Wetter-App als PWA (läuft im Browser und lässt sich auf PC, iPad, Android und iPhone wie eine App installieren). Kein Server, keine API-Schlüssel, kein Tracking.

## Was drin ist

- Aktuelles Wetter mit Messwert der nächsten DWD-Station
- Die nächsten 2 Stunden: Regen-Nowcast aus dem DWD-Radar in 5-Minuten-Schritten
- Amtliche DWD-Warnungen für die Gemeinde
- Für die Hasen: wann es dunkel/hell wird, Nachtfrost, Hitze, Wind/Gewitter/Regen/Schnee, Mückenabende
- 48 Stunden stündlich, 16 Tage mit Unsicherheitsband (51 Läufe des ECMWF-Ensembles)
- Regenradar mit Animation (1 h zurück, 2 h Vorhersage)
- Mehrere Orte, Suche, GPS-Standort
- Animierter Himmel im Hintergrund (Sonnenstand, Wolken, Regen, Schnee, Nebel, Blitze); bei "Bewegung reduzieren" statisch
- Offline: zeigt den letzten Stand

## Auf GitHub Pages veröffentlichen

1. Auf github.com ein neues **öffentliches** Repository anlegen, z. B. `wetter`.
2. Im Repository: **Add file → Upload files**, den **Inhalt** dieses Ordners hineinziehen (index.html muss direkt im Hauptverzeichnis liegen, nicht in einem Unterordner). **Commit changes**.
3. **Settings → Pages**: Source "Deploy from a branch", Branch `main`, Ordner `/ (root)`, **Save**.
4. Nach 1-2 Minuten läuft die App unter `https://DEIN-NAME.github.io/wetter/`.

## Installieren

- **iPhone / iPad (Safari):** Seite öffnen → Teilen → "Zum Home-Bildschirm".
- **Android (Chrome):** Seite öffnen → Menü ⋮ → "App installieren".
- **PC (Chrome / Edge):** Installieren-Symbol rechts in der Adressleiste.

## Updates

Dateien im Repository ersetzen. Die App lädt HTML/CSS/JS immer zuerst aus dem Netz, Änderungen sind also beim nächsten Öffnen da. Wenn du neue Dateien hinzufügst, in `sw.js` die Liste `SHELL` ergänzen und `VERSION` hochzählen.

Lokal testen (Windows): **Klar lokal starten.bat** doppelklicken. Startet einen kleinen Server nur mit PowerShell und öffnet http://localhost:8000 im Browser. Fenster schließen beendet ihn. Die .bat und der Ordner `tools` müssen nicht mit auf GitHub, stören dort aber auch nicht.

## Datenquellen

| Was | Quelle | Bedingungen |
|---|---|---|
| Vorhersage, Ensemble, Ortssuche | Open-Meteo | frei für nicht-kommerzielle Nutzung, < 10.000 Abrufe/Tag, CC BY 4.0 |
| Warnungen, Stationsmessung | DWD über Bright Sky | frei, DWD-Nutzungsbedingungen |
| Radar und Nowcast | DWD GeoServer (`dwd:Niederschlagsradar`) | frei, Quellenangabe DWD |
| Kartenhintergrund | OpenStreetMap-Kacheln | nur für geringe Nutzung, Quellenangabe |
| GPS-Ortsname | Nominatim (OpenStreetMap) | max. 1 Abruf/Sekunde |

Pro Aktualisierung fragt die App 5 Dienste ab, automatisch höchstens alle 10 Minuten (Radar alle 5 Minuten). Das liegt weit unter allen Limits.

## Schwellenwerte "Für die Hasen"

- Hitze: ab 25 °C kritisch, ab 30 °C Hitzschlaggefahr (TASSO, zooplus Tierratgeber)
- Kälte: Frost ab 0 °C (Trinkwasser), strenger Frost ab −10 °C (laut ZZF für gesunde Tiere im gut eingerichteten Gehege meist noch unproblematisch)
- Wind: DWD-Stufen, Windböen ab 50 km/h, Sturmböen ab 65 km/h
- Mücken: Faustregel, abends ab 12-15 °C und wenig Wind. Keine Messung.
- Dunkel/hell: Ende bzw. Beginn der bürgerlichen Dämmerung (Sonne 6° unter dem Horizont)

Schwellen stehen in `js/rabbits.js`.

## Aufbau

```
index.html, app.css     Oberfläche
js/main.js              Orte, Laden, Tabs, Zeitsteuerung
js/api.js               alle Datenabrufe
js/views.js             Darstellung der Bereiche
js/rabbits.js           Hasen-Hinweise
js/sky.js               animierter Hintergrund
js/radar.js             Radarkarte (Leaflet)
js/sun.js               Sonnenstand und Dämmerung
js/icons.js             Wettercodes und Symbole
sw.js                   Offline-Cache
tools/server.ps1        lokaler Testserver (über die .bat)
vendor/leaflet          Leaflet 1.9.4 (BSD-2)
fonts/                  Bricolage Grotesque (OFL)
```
