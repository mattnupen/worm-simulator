// `npm run dev`: the API server (restarts on changes) and Vite's page server together.
// Open http://localhost:5180. Local teacher password: "teacher".
import { spawn } from 'node:child_process';

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const procs = [
  run('node', ['--disable-warning=ExperimentalWarning', '--watch-path=server', '--watch-path=shared', 'server/main.ts']),
  run('npx', ['vite']),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
