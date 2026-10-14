import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs the built board on its own port with a throwaway store, filled with the sample board.
const dataDir = mkdtempSync(join(tmpdir(), 'burrow-e2e-'));

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:8799',
    // CHROMIUM_PATH: a Chromium already on the machine, when Playwright's own download isn't there.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning scripts/seed.ts && node --disable-warning=ExperimentalWarning server/main.ts',
    url: 'http://localhost:8799/api/health',
    env: { DATA_DIR: dataDir, PORT: '8799', TEACHER_PASSWORD: 'pw' },
    reuseExistingServer: false,
  },
});
