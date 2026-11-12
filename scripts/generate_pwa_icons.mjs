// Run from the repository root: node scripts/generate_pwa_icons.mjs
// Uses the existing development-only Playwright dependency, never website logos.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const assets = new URL('../web/public/assets/', import.meta.url);
const svg = await readFile(new URL('valenote-pwa.svg', assets), 'utf8');
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  headless: true,
});
try {
  const page = await browser.newPage();
  for (const size of [192, 512]) {
    const base64 = await page.evaluate(async ({ svg, size }) => {
      const image = new Image();
      image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(image, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { svg, size });
    await writeFile(new URL(`valenote-${size}.png`, assets), Buffer.from(base64, 'base64'));
    console.log(`Generated transparent ${size}px PWA icon`);
  }
} finally {
  await browser.close();
}
