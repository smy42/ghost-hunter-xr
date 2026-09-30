import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev`       -> normal auf localhost (http)
// `npm run dev:phone` -> https + im WLAN erreichbar, zum Testen am Handy
//                        (WebXR braucht HTTPS, sobald nicht über localhost zugegriffen wird)
export default defineConfig(({ mode }) => ({
  plugins: mode === 'phone' ? [basicSsl()] : [],
  server: {
    host: mode === 'phone' ? true : 'localhost',
  },
}));
