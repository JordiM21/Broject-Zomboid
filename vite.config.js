import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { attachRelay } from './server/relay.mjs';

// co-op works out of the box on the dev and preview servers
const coopRelay = { name: 'coop-relay', configureServer: (s) => { attachRelay(s.httpServer); }, configurePreviewServer: (s) => { attachRelay(s.httpServer); } };

export default defineConfig({ plugins: [viteSingleFile(), coopRelay], build: { target: 'es2020', assetsInlineLimit: 100000000 } });
