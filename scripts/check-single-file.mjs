import { readdirSync, readFileSync, statSync } from 'node:fs';

const MAX_MB = 8;
const errors = [];

const files = readdirSync('dist');
if (files.length !== 1 || files[0] !== 'index.html') {
  errors.push(`dist/ must contain only index.html, found: ${files.join(', ')}`);
}

const html = readFileSync('dist/index.html', 'utf8');
if (/<script[^>]+\bsrc=/i.test(html)) errors.push('found an external <script src=...>');
if (/<link[^>]+rel=["']?stylesheet/i.test(html)) errors.push('found an external stylesheet <link>');
if (!html.includes('http-equiv="Content-Security-Policy"')) errors.push('missing CSP meta tag');
if (!html.includes("connect-src 'none'")) errors.push("CSP does not block connections (connect-src 'none')");
if (html.indexOf('Content-Security-Policy') > html.indexOf('<script')) {
  errors.push('CSP meta must come before the first <script>');
}

const mb = statSync('dist/index.html').size / 1024 / 1024;
console.log(`dist/index.html: ${mb.toFixed(2)} MB (budget ${MAX_MB} MB)`);
if (mb > MAX_MB) errors.push(`over the ${MAX_MB} MB budget`);

if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  process.exit(1);
}
console.log('single-file build OK');
