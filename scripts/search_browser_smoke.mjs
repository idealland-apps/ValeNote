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
    if (q === 'ui-failure') {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'search failed' }) });
    }
    if (q === 'ui-empty') {
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    }
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
  await input.fill('needle body');
  await page.getByRole('button').filter({ hasText: 'renamed_book/result.md' }).click();
  await page.getByRole('heading', { name: 'needle', exact: true }).waitFor();
  await page.getByPlaceholder('Search...', { exact: true }).click();
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
  await input.fill('ui-failure');
  await page.getByRole('alert').filter({ hasText: 'Failed to search notes. Please try again.' }).waitFor();
  assert.equal(await page.getByText('No results found', { exact: true }).count(), 0);
  await input.fill('ui-empty');
  await page.getByText('No results found', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByPlaceholder('Search files and folders...').fill('result');
  await page.getByRole('tab', { name: 'Full-text', exact: true }).click();
  await page.getByPlaceholder('Search note content...').press('Escape');
  await page.getByPlaceholder('Search...', { exact: true }).click();
  assert.equal(await page.getByPlaceholder('Search note content...').inputValue(), '');
  await page.getByPlaceholder('Search note content...').press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  // Dialog drafts must reset on reopen without an Effect-driven flash of old values.
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click();
  let createDialog = page.getByRole('dialog', { name: 'Create New Notebook' });
  await createDialog.getByRole('textbox', { name: /^Name/ }).fill('discarded draft');
  await createDialog.getByLabel('Description', { exact: true }).fill('discarded description');
  await createDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await createDialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click();
  createDialog = page.getByRole('dialog', { name: 'Create New Notebook' });
  assert.equal(await createDialog.getByRole('textbox', { name: /^Name/ }).inputValue(), '');
  assert.equal(await createDialog.getByLabel('Description', { exact: true }).inputValue(), '');
  await createDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await createDialog.waitFor({ state: 'hidden' });

  // Breakpoint changes reset the sidebar, while manual toggles remain reversible.
  await page.setViewportSize({ width: 600, height: 800 });
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).waitFor({ state: 'visible' });

  // Typing must not recreate CodeMirror, and Ctrl+S must see the latest draft.
  await page.getByRole('tab').nth(0).click();
  const editor = page.locator('.cm-content[contenteditable="true"]');
  await editor.waitFor();
  await editor.evaluate(element => { element.dataset.smokeInstance = 'original'; });
  await editor.fill('# Browser heading\n\n## Second\n\nfixture');
  await page.getByText('Unsaved', { exact: true }).waitFor();
  assert.equal(await editor.getAttribute('data-smoke-instance'), 'original');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  assert.equal(await editor.getAttribute('data-smoke-instance'), 'original');
  const saved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/api/v1/notes/renamed_book/result.md'));
  await editor.press('Control+s');
  const savedResponse = await saved;
  assert.equal(savedResponse.status(), 200);
  assert.equal((await savedResponse.json()).content, '# Browser heading\n\n## Second\n\nfixture');
  await page.getByText('Unsaved', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('tab').nth(1).click();
  await page.getByRole('heading', { name: 'Browser heading', exact: true }).waitFor();
  assert.deepEqual(await page.locator('[data-heading-index]').evaluateAll(elements => elements.map(element => element.getAttribute('data-heading-index'))), ['0', '1']);

  // The refactored public page must also render through real unauthenticated routes.
  const published = await page.request.put(base + '/api/v1/notebooks/renamed_book', {
    headers: { Authorization: `Bearer ${token}` }, data: { is_public: true },
  });
  assert.equal(published.status(), 200);
  const publicPage = await browser.newPage();
  publicPage.on('pageerror', error => errors.push(error.message));
  await publicPage.goto(base + '/public/renamed_book/result');
  await publicPage.getByRole('heading', { name: 'Browser heading', exact: true }).waitFor();
  assert.deepEqual(await publicPage.locator('[data-heading-index]').evaluateAll(elements => elements.map(element => element.getAttribute('data-heading-index'))), ['0', '1']);
  await publicPage.close();

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', checks: ['real backend search result opens note', 'real Chromium UI: obsolete search cannot replace newest result', 'search failure distinguished from empty results', 'clear/tab/close/reopen', 'dialog drafts reset on reopen', 'responsive sidebar and reversible toggles', 'editor instance retained while typing; keyboard saves latest draft', 'stable per-document heading indices', 'real unauthenticated public note', 'no page errors'] }));
} finally {
  await browser.close();
}
