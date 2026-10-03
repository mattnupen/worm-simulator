import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VERSION_META } from './src/version.js';

// Blocks every outside connection. Nothing the student does can leave the device.
export const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  'font-src data:',
  'worker-src blob:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Build only: the dev server needs its own client script and websocket. Also stamps the version
// (src/version.ts), which `npm run release` checks.
function injectCsp(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">\n    ${VERSION_META}`,
      );
    },
  };
}

export default defineConfig({
  plugins: [injectCsp(), viteSingleFile()],
  build: { target: 'es2020', modulePreload: false },
  test: { include: ['tests/unit/**/*.test.ts'], testTimeout: 30_000 },
});
