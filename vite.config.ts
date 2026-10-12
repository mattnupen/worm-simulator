import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VERSION_META } from './src/version.js';

// The game's code can't connect anywhere (connect-src 'none'), so it sends no data. The one outside
// site the page may frame is YouTube's no-cookie player, for lesson videos (Matt, 2026-10-12). Links
// out are not limited by the CSP; they open in a new tab.
export const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  'font-src data:',
  'worker-src blob:',
  "connect-src 'none'",
  'frame-src https://www.youtube-nocookie.com',
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
