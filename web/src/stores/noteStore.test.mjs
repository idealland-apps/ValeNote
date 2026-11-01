import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function mountStore() {
  const requests = { notebooks: [], files: [] };
  const imports = {
    '../services/api': {
      notebookApi: {
        list: () => new Promise((resolve, reject) => requests.notebooks.push({ resolve, reject })),
      },
      fileApi: {
        list: (...args) => new Promise((resolve, reject) => requests.files.push({ args, resolve, reject })),
      },
    },
  };
  const source = readFileSync(new URL('./noteStore.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: name => imports[name] ?? require(name),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    AbortController,
  });
  return { store: exports.useNoteStore, requests };
}

test('refresh reloads notebooks and all files without changing the editor or global loading state', async () => {
  const { store, requests } = mountStore();
  const note = { path: 'notes/current.md', content: 'unsaved editor content', etag: 'original' };
  const dirtyChecker = () => true;
  store.setState({ currentNote: note, dirtyChecker });
  const refresh = store.getState().refreshFileTree();
  assert.equal(store.getState().isFileTreeRefreshing, true);
  assert.equal(store.getState().isLoading, false);
  assert.equal(requests.files[0].args[0], undefined);
  assert.equal(requests.files[0].args[1], true);
  const files = [{ path: 'new/nested/agent.md', type: 'file' }];
  const notebooks = [{ name: 'new', is_public: true }];
  requests.files[0].resolve({ data: files });
  await Promise.resolve();
  assert.equal(store.getState().fileItems.length, 0, 'publish both lists together');
  requests.notebooks[0].resolve({ data: notebooks });
  await refresh;
  assert.equal(store.getState().fileItems, files);
  assert.equal(store.getState().notebooks, notebooks);
  assert.equal(store.getState().currentNote, note);
  assert.equal(store.getState().dirtyChecker, dirtyChecker);
  assert.equal(store.getState().isLoading, false);
  assert.equal(store.getState().isFileTreeRefreshing, false);
});

test('repeated refresh clicks do not start overlapping requests', async () => {
  const { store, requests } = mountStore();
  const refresh = store.getState().refreshFileTree();
  await store.getState().refreshFileTree();
  assert.equal(requests.files.length, 1);
  assert.equal(requests.notebooks.length, 1);
  requests.files[0].resolve({ data: [] });
  requests.notebooks[0].resolve({ data: [] });
  await refresh;
});

for (const failingList of ['files', 'notebooks']) {
  test(`a failed ${failingList} refresh retains the old tree, reports failure, and allows retry`, async () => {
    const { store, requests } = mountStore();
    const files = [{ path: 'existing.md', type: 'file' }];
    const notebooks = [{ name: 'existing' }];
    store.setState({ fileItems: files, notebooks });
    const refresh = store.getState().refreshFileTree();
    const error = new Error('network unavailable');
    const otherList = failingList === 'files' ? 'notebooks' : 'files';
    requests[otherList][0].resolve({ data: [] });
    requests[failingList][0].reject(error);
    await assert.rejects(refresh, error);
    assert.equal(store.getState().fileItems, files);
    assert.equal(store.getState().notebooks, notebooks);
    assert.equal(store.getState().isFileTreeRefreshing, false);
    const retry = store.getState().refreshFileTree();
    requests.files[1].resolve({ data: null });
    requests.notebooks[1].resolve({ data: [] });
    await retry;
    assert.equal(store.getState().fileItems.length, 0);
    assert.equal(store.getState().notebooks.length, 0);
  });
}
