import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.ts';
import { createApp } from './app.ts';

// On Render: DATA_DIR is the mounted disk (render.yaml), TEACHER_PASSWORD is set in the Dashboard.
const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = process.env.DATA_DIR ?? join(here, '..', 'data');
const production = process.env.NODE_ENV === 'production';
let teacherPassword = process.env.TEACHER_PASSWORD ?? '';
if (!teacherPassword && !production) {
  teacherPassword = 'teacher';
  console.log('No TEACHER_PASSWORD set: the local teacher password is "teacher".');
}

const db = openDb(join(dataDir, 'board.db'));
const handle = createApp({
  db, teacherPassword, secure: production, staticDir: join(here, '..', 'dist'),
  basePath: '/burrow',
  // wormsimulator.com passes /burrow/… through to this service (render.yaml).
  publicOrigins: (process.env.PUBLIC_ORIGINS ?? 'https://wormsimulator.com,https://www.wormsimulator.com').split(',').map((s) => s.trim()).filter(Boolean),
});
const port = Number(process.env.PORT ?? 8787);
createServer((req, res) => void handle(req, res)).listen(port, () => {
  console.log(`Burrow Board on http://localhost:${port}/burrow/`);
});
