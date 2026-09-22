import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function loadTypescript(relativePath, imports) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    .replace('import.meta.env.VITE_API_URL', 'undefined');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: (name) => imports[name] ?? require(name),
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    AbortController,
  });
  return exports;
}

// Execute the real component without a DOM: only hooks and presentation components
// are substituted. Effects run after each render, including dependency cleanup.
function mountDialog(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const slots = [];
  let cursor = 0;
  let dirty = true;
  let effects = [];
  let mutations = 0;
  let tree;
  let props = { open: true, onClose() {}, onSelect() {}, fileItems: [] };
  const requests = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, (value) => {
        mutations++;
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) {
          slots[index].value = next;
          dirty = true;
        }
      }];
    },
    useRef(initial) {
      return (slots[cursor++] ??= { current: initial });
    },
    useCallback(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        slots[index] = { value: callback, deps };
      }
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const { default: SearchDialog } = loadTypescript('./SearchDialog.tsx', {
    react,
    '@mui/material': new Proxy({}, { get: (_, name) => name }),
    '@mui/icons-material': new Proxy({}, { get: (_, name) => name }),
    '../services/api': { noteApi: { searchFulltext(...args) {
      // Intentionally ignore cancellation: even an already-resolved transport or
      // one that doesn't honor abort must never publish an obsolete result.
      return new Promise((resolve, reject) => requests.push({ args, resolve, reject }));
    } } },
  });
  function render() {
    let iterations = 0;
    while (dirty) {
      assert.ok(++iterations < 20, 'render must settle');
      dirty = false;
      cursor = 0;
      effects = [];
      tree = SearchDialog(props);
      effects.forEach(effect => effect());
    }
  }
  function nodes(type, node = tree) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(child => nodes(type, child));
    return [...(node.type === type ? [node] : []), ...nodes(type, node.props?.children ?? null)];
  }
  t.after(() => slots.forEach(slot => slot.cleanup?.()));
  render();
  return {
    requests,
    change(query) { nodes('TextField')[0].props.onChange({ target: { value: query } }); render(); },
    tab(value) { nodes('Tabs')[0].props.onChange(null, value); render(); },
    open(open) { props = { ...props, open }; dirty = true; render(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
    tick(ms = 300) { t.mock.timers.tick(ms); render(); },
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
    titles() { return nodes('ListItemText').map(node => node.props.primary); },
    loading() { return nodes('TextField')[0].props.slotProps.input.endAdornment !== null; },
    mutations() { return mutations; },
  };
}

const result = title => ({ data: [{ title, path: `${title}.md`, notebook: 'notes' }] });

test('an older completion cannot overwrite the latest search results', async (t) => {
  const dialog = mountDialog(t);
  dialog.change('first');
  dialog.tick();
  dialog.change('second');
  dialog.tick();
  assert.equal(dialog.requests.length, 2);
  dialog.requests[1].resolve(result('newest'));
  await dialog.settle();
  const latest = dialog.titles();
  assert.equal(latest.length, 1);
  dialog.requests[0].resolve(result('obsolete'));
  await dialog.settle();
  assert.deepEqual(dialog.titles(), latest);
});

test('changing query aborts the transport, including the next debounce window', (t) => {
  const dialog = mountDialog(t);
  dialog.change('first');
  dialog.tick();
  const signal = dialog.requests[0].args[3];
  assert.ok(signal instanceof AbortSignal, 'search must receive a real AbortSignal');
  assert.equal(signal.aborted, false);
  dialog.change('second');
  assert.equal(signal.aborted, true);
  assert.equal(dialog.requests.length, 1);
});

test('searchFulltext forwards AbortSignal to axios without changing search parameters', () => {
  let received;
  const api = {
    interceptors: { request: { use() {} }, response: { use() {} } },
    get(url, config) { received = { url, config }; },
  };
  const { noteApi } = loadTypescript('../services/api.ts', {
    axios: { create: () => api },
  });
  const signal = new AbortController().signal;
  noteApi.searchFulltext('hello', 'notes', 7, signal);
  assert.equal(received.config.signal, signal);
  assert.equal(received.url, '/search/fulltext');
  assert.equal(JSON.stringify(received.config.params), JSON.stringify({ q: 'hello', notebook: 'notes', limit: 7 }));
  noteApi.searchFulltext('hello');
  assert.equal(received.config.params.limit, 20);
});

for (const [name, invalidate] of [
  ['cleared query', dialog => dialog.change('')],
  ['whitespace query', dialog => dialog.change('   ')],
  ['closed dialog', dialog => dialog.open(false)],
  ['file tab', dialog => dialog.tab(1)],
  ['unmount', dialog => dialog.unmount()],
]) {
  test(`${name} cancels pending debounce`, (t) => {
    const dialog = mountDialog(t);
    dialog.change('first');
    invalidate(dialog);
    dialog.tick();
    assert.equal(dialog.requests.length, 0);
  });

  test(`${name} aborts in-flight search and ignores its late completion`, async (t) => {
    const dialog = mountDialog(t);
    dialog.change('first');
    dialog.tick();
    assert.equal(dialog.loading(), true);
    invalidate(dialog);
    assert.equal(dialog.requests[0].args[3].aborted, true);
    if (name !== 'unmount') assert.equal(dialog.loading(), false);
    const mutations = dialog.mutations();
    dialog.requests[0].resolve(result('obsolete'));
    await dialog.settle();
    assert.equal(dialog.mutations(), mutations, 'obsolete results/finally must not mutate state');
  });
}

test('changing or clearing a query removes existing results before the next debounce', async (t) => {
  const dialog = mountDialog(t);
  dialog.change('first');
  dialog.tick();
  dialog.requests[0].resolve(result('previous'));
  await dialog.settle();
  assert.equal(dialog.titles().length, 1);
  dialog.change('second');
  assert.equal(dialog.titles().length, 0);
  dialog.change('');
  dialog.change('first');
  assert.equal(dialog.titles().length, 0, 'cleared results must not reappear');
});

for (const outcome of ['resolve', 'reject']) {
  test(`obsolete ${outcome} cannot mutate state while the next query is debouncing`, async (t) => {
    const dialog = mountDialog(t);
    dialog.change('first');
    dialog.tick();
    dialog.change('second');
    const mutations = dialog.mutations();
    dialog.requests[0][outcome](outcome === 'resolve' ? result('obsolete') : new Error('obsolete failure'));
    await dialog.settle();
    assert.equal(dialog.mutations(), mutations);
    assert.equal(dialog.titles().length, 0);
    dialog.tick();
    assert.equal(dialog.requests.length, 2);
    assert.equal(dialog.loading(), true);
  });

  test(`obsolete ${outcome} cannot stop the latest loading indicator`, async (t) => {
    const dialog = mountDialog(t);
    dialog.change('first');
    dialog.tick();
    dialog.change('second');
    dialog.tick();
    dialog.requests[0][outcome](outcome === 'resolve' ? result('obsolete') : new Error('obsolete failure'));
    await dialog.settle();
    assert.equal(dialog.loading(), true);
    assert.equal(dialog.titles().length, 0);
    dialog.requests[1].resolve(result('newest'));
    await dialog.settle();
    assert.equal(dialog.loading(), false);
    assert.equal(dialog.titles().length, 1);
  });
}

test('an obsolete failure cannot erase the latest results', async (t) => {
  const dialog = mountDialog(t);
  dialog.change('first');
  dialog.tick();
  dialog.change('second');
  dialog.tick();
  dialog.requests[1].resolve(result('newest'));
  await dialog.settle();
  const latest = dialog.titles();
  dialog.requests[0].reject(new Error('obsolete failure'));
  await dialog.settle();
  assert.deepEqual(dialog.titles(), latest);
});

test('reopening or returning to full-text starts clean, with no stale spinner', async (t) => {
  const dialog = mountDialog(t);
  dialog.change('first');
  dialog.tick();
  dialog.open(false);
  dialog.open(true);
  assert.equal(dialog.loading(), false);
  dialog.requests[0].resolve(result('obsolete'));
  await dialog.settle();
  dialog.change('second');
  dialog.tick();
  dialog.tab(1);
  dialog.tab(0);
  assert.equal(dialog.loading(), false);
  dialog.requests[1].reject(new Error('obsolete failure'));
  await dialog.settle();
  assert.equal(dialog.titles().length, 0);
  dialog.tick();
  dialog.requests[2].resolve(result('newest'));
  await dialog.settle();
  assert.equal(dialog.titles().length, 1);
});

test('only the final debounced query runs, and current failures clear loading', async (t) => {
  const dialog = mountDialog(t);
  dialog.change('first');
  dialog.tick(200);
  dialog.change(' second ');
  dialog.tick(299);
  assert.equal(dialog.requests.length, 0);
  dialog.tick(1);
  assert.equal(dialog.requests.length, 1);
  assert.equal(dialog.requests[0].args[0], 'second');
  dialog.requests[0].reject(new Error('current failure'));
  await dialog.settle();
  assert.equal(dialog.loading(), false);
  assert.equal(dialog.titles().length, 0);
});
