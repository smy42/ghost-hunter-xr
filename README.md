# ghost-hunter-xr
An interactive WebXR ghost hunting game built with TypeScript and Three.js.

## Setup

```bash
npm install
npm run dev         # http://localhost:5173 im Browser am Laptop (3D-Modus)
npm run dev:phone   # HTTPS + im WLAN erreichbar -> "Network"-Adresse am Handy öffnen
```

- AR läuft auf **Android + Chrome** (ARCore). iPhone/Safari unterstützt WebXR-AR nicht → dort läuft der 3D-Modus.
- Bei `dev:phone` zeigt der Browser eine Zertifikatswarnung (selbst signiert) -> "Trotzdem fortfahren".
- Laptop und Handy müssen im selben WLAN sein.

## Projektstruktur

| Ordner | Inhalt | Zuständig |
|---|---|---|
| `src/main.ts` | Verbindet alle Bereiche, Render-Loop | gemeinsam (absprechen) |
| `src/types.ts` | Gemeinsame Typen (`Ghost`, `GameSnapshot`) | gemeinsam (absprechen!) |
| `src/core/` | Szene, Kamera, Renderer, Licht | gemeinsam |
| `src/xr/` | AR-Session & Tracking | Sümi |
| `src/ghosts/` | Geister spawnen, Modelle laden | Sümi |
| `src/desktop/` | 3D-Modus: Raum, Maus/WASD-Steuerung | Person B |
| `src/game/` | Zielen, Fangen, Score, Zeit, Win/Lose | Person B |
| `src/ui/` | Screens & Anzeigen (HTML/CSS in `#ui`) | Person C |
| `public/models/` | 3D-Modelle (`.glb`) | alle |

Offene Aufgaben sind im Code mit `TODO (Name)` markiert.

**Wichtig für ui/:** Alle Anzeigen kommen in `<div id="ui">`, nicht direkt in `<body>` – nur so bleiben sie in AR sichtbar.

## Git

- Eigener Branch pro Person/Feature, z. B. `feature/ar-ghosts`, `feature/desktop-game`, `feature/ui`
- Vor dem Arbeiten `main` pullen, regelmäßig (mind. 2× pro Woche) in `main` mergen
- Dateien aus anderen Bereichen nur nach kurzer Absprache ändern

## Stack
Vite · TypeScript · Three.js · WebXR
