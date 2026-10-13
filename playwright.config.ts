import { defineConfig } from '@playwright/test';

// Software GPU flags so headless Chromium can create a WebGPU adapter.
const webgpuArgs = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-vulkan=swiftshader',
  '--use-webgpu-adapter=swiftshader',
  '--ignore-gpu-blocklist',
  // Without a SwiftShader GL compositor the WebGPU device in headless Chromium loses its textures.
  '--use-angle=swiftshader',
];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: 'webgl2', use: { browserName: 'chromium', launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } }, metadata: { query: 'renderer=webgl' } },
    { name: 'webgpu', use: { browserName: 'chromium', launchOptions: { args: webgpuArgs } }, metadata: { query: '' } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
