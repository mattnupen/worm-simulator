import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    // Software WebGL so the test runs on machines without a GPU.
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
});
