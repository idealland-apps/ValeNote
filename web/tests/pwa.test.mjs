import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

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
