// Real Chromium regression check against the built UI in the disposable smoke server.
// Delayed search responses below are deliberately synthetic fixtures, not backend data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.VALENOTE_SMOKE_URL;
const token = process.env.VALENOTE_SMOKE_TOKEN;
assert.ok(base && token, 'Run via scripts/search_smoke.py --browser');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(value => localStorage.setItem('token', value), token);
  let releaseOld;
  let oldStarted;
  let oldFinished;
  const started = new Promise(resolve => { oldStarted = resolve; });
  const released = new Promise(resolve => { releaseOld = resolve; });
  const finished = new Promise(resolve => { oldFinished = resolve; });
  await page.route('**/api/v1/search/fulltext?**', async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q !== 'ui-old' && q !== 'ui-new') return route.continue();
    if (q === 'ui-old') { oldStarted(); await released; }
    const response = [{ path: `z_allowed/${q}.md`, title: q === 'ui-new' ? 'Newest result fixture' : 'Obsolete result fixture', snippet: q, notebook: 'z_allowed' }];
    try {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
    } catch (error) {
      // Cancellation can dispose the intercepted old request before it is fulfilled.
      if (q !== 'ui-old') throw error;
    } finally {
      if (q === 'ui-old') oldFinished();
    }
  });
  await page.goto(base + '/app');
  await page.getByPlaceholder('Search...', { exact: true }).click();
  const input = page.getByPlaceholder('Search note content...');
  await input.fill('ui-old');
  await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('search did not start')), 5000))]);
  await input.fill('ui-new');
  await page.getByText('Newest result fixture', { exact: true }).waitFor();
  releaseOld();
  await finished;
  await page.waitForTimeout(100);
  assert.equal(await page.getByText('Obsolete result fixture', { exact: true }).count(), 0);
  await input.fill('');
  await page.getByText('Type to search note content', { exact: true }).waitFor();
  assert.equal(await page.getByText('Newest result fixture', { exact: true }).count(), 0);
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByPlaceholder('Search files and folders...').fill('result');
  await page.getByRole('tab', { name: 'Full-text', exact: true }).click();
  await page.getByPlaceholder('Search note content...').press('Escape');
  await page.getByPlaceholder('Search...', { exact: true }).click();
  assert.equal(await page.getByPlaceholder('Search note content...').inputValue(), '');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', checks: ['real Chromium UI: obsolete search cannot replace newest result', 'clear/tab/close/reopen', 'no page errors'] }));
} finally {
  await browser.close();
}
