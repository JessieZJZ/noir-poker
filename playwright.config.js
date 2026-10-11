import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.NOIR_E2E_PORT ?? 4175);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error('NOIR_E2E_PORT must be a valid TCP port');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: 'list',
  use: { locale: 'zh-CN', timezoneId: 'Asia/Shanghai', baseURL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --mode test --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
