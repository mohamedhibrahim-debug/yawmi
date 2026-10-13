import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// `--mode artifact` (hosted preview) and `--mode native` (the iOS app via Capacitor) build without a service worker
// (relative asset paths, PWA registration stubbed out).
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact' || mode === 'native';
  const outDir = mode === 'native' ? 'dist-native' : 'dist-artifact';
  return {
    base: artifact ? './' : (process.env.BASE_PATH ?? '/'),
    build: artifact ? { outDir, emptyOutDir: true } : undefined,
    resolve: artifact
      ? { alias: { 'virtual:pwa-register/preact': fileURLToPath(new URL('./src/pwa-stub.ts', import.meta.url)) } }
      : undefined,
    plugins: [
      preact(),
      !artifact &&
        VitePWA({
          registerType: 'prompt',
          includeAssets: ['icon.svg', 'logo.svg'],
          manifest: {
            name: 'يومي · Yawmi',
            short_name: 'يومي',
            description: 'مهام البيت وروتينك ووقت لنفسك، في يوم مرن يناسبك.',
            lang: 'ar',
            dir: 'rtl',
            start_url: '.',
            scope: '.',
            display: 'standalone',
            background_color: '#f2f4ef',
            theme_color: '#28574a',
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }
            ]
          },
          workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] }
        })
    ],
    test: { environment: 'node', include: ['tests/**/*.test.ts'] }
  };
});
