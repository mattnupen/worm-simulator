// Performance gates (spec 2026-10-01 section 6): each preset's uncapped speed-test fps must be at
// least a fixed fraction of the Step 0 page's fps, measured back to back on the same machine so
// background load cancels out.
//
// Usage: npm run build && node scripts/perf-gates.mjs [cycles=4] [presets...]
// It builds the Step 0 baseline once into .cache/step0 (git worktree at STEP0_REF), then runs
// S0, p1, p2, S0, p3, p4, S0 ... and prints each preset's median ratio against its gate.
// Takes ~4 min per cycle. Close other heavy apps first; results are still noisy (±5%).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const STEP0_REF = '966b874'; // the final Step 0 page on main, the baseline Step 1a's gates were measured against
// The original absolute gates (50/40/34/28 fps) were set against the Step 0 prototype's 45.9 fps on a
// quiet machine; the final Step 0 page runs within ~5% of that, so the ratios carry over.
const STEP0_FPS = 45.9;
const GATES = { low: 50 / STEP0_FPS, medium: 40 / STEP0_FPS, high: 34 / STEP0_FPS, ultra: 28 / STEP0_FPS };

const repo = process.cwd();
const bench = path.join(repo, 'scripts/bench.mjs');
const step0 = path.join(repo, '.cache/step0');
const [cyclesArg, ...presetArgs] = process.argv.slice(2);
const cycles = Number(cyclesArg ?? 4);
const presets = presetArgs.length ? presetArgs : ['low', 'medium', 'high', 'ultra'];

if (!existsSync(path.join(step0, 'dist/index.html'))) {
  if (!existsSync(step0)) execFileSync('git', ['worktree', 'add', '--detach', step0, STEP0_REF], { stdio: 'inherit' });
  execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: step0, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: step0, stdio: 'inherit' });
}

const runs = [];
function run(dir, label, query) {
  let txt = '';
  try { txt = execFileSync('node', [bench, dir, label, query], { encoding: 'utf8', timeout: 300_000 }); }
  catch (e) { txt = String(e.stdout ?? '') + String(e); }
  const fps = Number((txt.match(/Full quality, no cap: ([\d.]+)/) ?? [])[1]);
  const m = txt.match(/idle 1s: (\d+) draw calls, (\d+) tris over (\d+) rAFs/);
  const frames = m ? Math.min(Number(m[3]), 30) : NaN; // ~30 rendered frames at the cap
  const rec = { label, fps, draws: m ? Number(m[1]) / frames : NaN, tris: m ? Number(m[2]) / frames : NaN };
  runs.push(rec);
  console.log(JSON.stringify(rec));
}

run(step0, 's0', '');
for (let c = 0; c < cycles; c++) {
  const order = presets.map((_, i) => presets[(i + c) % presets.length]);
  for (let i = 0; i < order.length; i += 2) {
    run(repo, order[i], `?speedtest=1&preset=${order[i]}`);
    if (order[i + 1]) run(repo, order[i + 1], `?speedtest=1&preset=${order[i + 1]}`);
    run(step0, 's0', '');
  }
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
let failed = false;
console.log(`\nStep 0 fps this session: ${runs.filter((r) => r.label === 's0').map((r) => r.fps).join(', ')}`);
for (const p of presets) {
  const ratios = [], draws = [], tris = [];
  runs.forEach((r, i) => {
    if (r.label !== p) return;
    const s0 = runs[i - 1]?.label === 's0' ? runs[i - 1] : runs[i + 1]?.label === 's0' ? runs[i + 1] : null;
    if (s0) { ratios.push(r.fps / s0.fps); draws.push(r.draws); tris.push(r.tris); }
  });
  const med = median(ratios);
  const pass = med >= GATES[p];
  failed ||= !pass;
  console.log(`${p.padEnd(7)} median ${med.toFixed(3)} gate ${GATES[p].toFixed(3)} ${pass ? 'PASS' : 'FAIL'}  ratios ${ratios.map((x) => x.toFixed(2)).join(' ')}  draws ≤ ${Math.max(...draws).toFixed(0)}  tris ≤ ${(Math.max(...tris) / 1000).toFixed(0)}k`);
}
process.exit(failed ? 1 : 0);
