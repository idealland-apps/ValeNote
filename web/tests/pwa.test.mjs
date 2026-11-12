import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';

// Decode the checked-in 8-bit RGBA icons without adding an image dependency.
function rgbaPixels(png) {
  assert.equal(png[24], 8);
  assert.equal(png[25], 6);
  assert.equal(png[28], 0); // No interlacing.
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= 4 ? pixels[index - 4] : 0;
      const up = y ? pixels[index - stride] : 0;
      const diagonal = y && x >= 4 ? pixels[index - stride - 4] : 0;
      const prediction = left + up - diagonal;
      const distances = [left, up, diagonal].map(value => Math.abs(prediction - value));
      const paeth = [left, up, diagonal][distances.indexOf(Math.min(...distances))];
      const predictors = [0, left, up, Math.floor((left + up) / 2), paeth];
      pixels[index] = (raw[y * (stride + 1) + x + 1] + predictors[filter]) & 255;
    }
  }
  return pixels;
}

test('PWA icons have transparent margins, white outlines and the original blue artwork', async () => {
  for (const size of [192, 512]) {
    const png = await readFile(new URL(`public/assets/valenote-${size}.png`, webRoot));
    const pixels = rgbaPixels(png);
    let transparent = 0;
    let white = 0;
    let blue = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const [r, g, b, a] = pixels.subarray(index, index + 4);
      if (a === 0) transparent++;
      if (a === 255 && r === 255 && g === 255 && b === 255) white++;
      if (a === 255 && b > r && b > g) blue++;
    }
    assert.ok(transparent > size * size / 2, 'background must be transparent, not a white tile');
    assert.ok(white > size * size * 0.015, 'a visible white outline must surround the artwork');
    assert.ok(blue > size * size * 0.1, 'preserve the blue triangle artwork');
    for (let axis = 0; axis < size; axis++) {
      for (const [x, y] of [[axis, 0], [axis, size - 1], [0, axis], [size - 1, axis]]) {
        assert.equal(pixels[(y * size + x) * 4 + 3], 0, 'outline must not touch the canvas edge');
      }
    }
  }
});

const webRoot = new URL('../', import.meta.url);

test('the app advertises a stable, standalone ValeNote installation', async () => {
  const html = await readFile(new URL('index.html', webRoot), 'utf8');
  const link = html.match(/<link\s+rel="manifest"\s+href="([^"]+)"\s*\/>/);
  assert.ok(link, 'index.html must link to the web app manifest');
  // Reuse /assets, already publicly served by both Vite and the Go server.
  assert.equal(link[1], '/assets/valenote.webmanifest');
  const manifest = JSON.parse(await readFile(new URL(`public${link[1]}`, webRoot), 'utf8'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.name, 'ValeNote');
  assert.equal(manifest.short_name, 'ValeNote');
  assert.equal(manifest.start_url, '/app');
  assert.equal(manifest.scope, '/'); // Includes the existing /login redirect.
  assert.equal(manifest.display, 'standalone');
  assert.notEqual(manifest.prefer_related_applications, true);

  for (const size of [192, 512]) {
    const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
    assert.ok(icon, `missing ${size}px installation icon`);
    assert.equal(icon.type, 'image/png');
    const iconUrl = new URL(icon.src, new URL(link[1], 'https://valenote.example'));
    assert.equal(iconUrl.origin, 'https://valenote.example');
    assert.ok(iconUrl.pathname.startsWith('/assets/'));
    const png = await readFile(new URL(`public${iconUrl.pathname}`, webRoot));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
