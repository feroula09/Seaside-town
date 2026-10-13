import { expect, test, type Page } from '@playwright/test';

// window.__seaside is declared in src/main.ts.

// Width must be a multiple of 64 so WebGPU readback rows have no padding.
const W = 256;
const H = 160;

async function open(page: Page, query: string) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(query ? `/?${query}` : '/');
  await page.waitForFunction(() => window.__seaside?.ready, null, { timeout: 60_000 });
  return errors;
}

/** Software-rendered CI can take hundreds of ms per frame, so wait on frames, not wall time. */
async function waitFrames(page: Page, n: number) {
  const start = await page.evaluate(() => window.__seaside!.frames);
  await page.waitForFunction((target) => window.__seaside!.frames >= target, start + n, { timeout: 60_000 });
}

function diffCount(a: number[], b: number[]): number {
  let n = 0;
  for (let k = 0; k < a.length; k += 4) {
    if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 12) n++;
  }
  return n;
}

test('boots, shows the badge and draws a non-empty frame', async ({ page }, info) => {
  const errors = await open(page, info.project.metadata.query as string);
  const backend = await page.evaluate(() => window.__seaside!.backend);
  await expect(page.locator('.hud-badge')).toHaveText(new RegExp(`${backend === 'webgpu' ? 'WebGPU' : 'WebGL2'} · Sunset`));
  await expect(page.locator('.hud-title h1')).toHaveText('Seaside Town.');

  const frame = await page.evaluate(([w, h]) => window.__seaside!.capture(w, h), [W, H]);
  const lum = [];
  for (let k = 0; k < frame.data.length; k += 4) lum.push(frame.data[k] + frame.data[k + 1] + frame.data[k + 2]);
  const mean = lum.reduce((s, v) => s + v, 0) / lum.length;
  const variance = lum.reduce((s, v) => s + (v - mean) ** 2, 0) / lum.length;
  expect(variance).toBeGreaterThan(500); // sky + block, not a flat clear colour

  await waitFrames(page, 3); // the loop keeps running
  expect(errors).toEqual([]);
});

test('poking the water changes the frame', async ({ page }, info) => {
  await open(page, info.project.metadata.query as string);
  await waitFrames(page, 2);
  const before = await page.evaluate(([w, h]) => window.__seaside!.capture(w, h), [W, H]);
  await page.evaluate(() => window.__seaside!.poke(-4, 6, -0.5));
  await waitFrames(page, 3);
  const after = await page.evaluate(([w, h]) => window.__seaside!.capture(w, h), [W, H]);
  expect(diffCount(before.data, after.data)).toBeGreaterThan(50);
});

test('dragging on the water makes waves instead of orbiting', async ({ page }, info) => {
  test.skip(info.project.name !== 'webgl2', 'canvas screenshots are blank for WebGPU in headless Chromium');
  await open(page, info.project.metadata.query as string);
  await waitFrames(page, 2);
  const canvas = page.locator('#scene');
  const before = await canvas.screenshot();
  // The middle of the screen is open water in the default view.
  await page.mouse.move(560, 520);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(560 + i * 12, 520 - i * 4);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await waitFrames(page, 3);
  const after = await canvas.screenshot();
  expect(after.equals(before)).toBe(false);
  // Camera must not have moved: the sky band at the top stays identical.
  const sky = await page.screenshot({ clip: { x: 300, y: 0, width: 600, height: 60 } });
  await page.mouse.move(10, 10);
  const sky2 = await page.screenshot({ clip: { x: 300, y: 0, width: 600, height: 60 } });
  expect(sky.equals(sky2)).toBe(true);
});
