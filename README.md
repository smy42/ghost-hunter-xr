# ghost-hunter-xr
An interactive WebXR ghost hunting game built with TypeScript and Three.js.

## Setup

```bash
npm install
npm run dev         # http://localhost:5173 im Browser am Laptop
npm run dev:phone   # HTTPS + im WLAN erreichbar -> "Network"-Adresse am Handy öffnen
```

- AR läuft auf **Android + Chrome** (ARCore). iPhone/Safari unterstützt WebXR-AR nicht.
- Bei `dev:phone` zeigt der Browser eine Zertifikatswarnung (selbst signiert) -> "Trotzdem fortfahren".
- Laptop und Handy müssen im selben WLAN sein.

## Stack
Vite · TypeScript · Three.js · WebXR
