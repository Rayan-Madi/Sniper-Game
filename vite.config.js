import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    host: true,   // expose sur le réseau local → une 2ᵉ machine peut rejoindre via l'IP LAN
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    testTimeout: 20000,   // tests/briefing/ids.test.js et tests/scripts/port-maquette.test.js dépassent 5 s sur machine chargée
  },
})
