import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Run the actual page with deterministic hooks and deferred API calls. Only
// routing, external I/O, and presentation components are substituted.
function mountPage(t, initial = {}) {
  let params = { notebook: 'book', '*': '', ...initial };
  let mobile = false;
  let dirty = true;
  let current;
  let effects = [];
  let tree;
  let mutations = 0;
  let synchronousEffectMutations = 0;
  let runningEffects = false;
  let instances = new Map();
  const requests = [];
  const navigations = [];
  const react = {
    useState(initialValue) {
      const instance = current;
      const index = instance.cursor++;
      instance.slots[index] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [instance.slots[index].value, value => {
        mutations++;
        if (runningEffects) synchronousEffectMutations++;
        const slot = instance.slots[index];
        const next = typeof value === 'function' ? value(slot.value) : value;
        if (!Object.is(slot.value, next)) { slot.value = next; dirty = true; }
      }];
    },
    useRef(initialValue) {
      return (current.slots[current.cursor++] ??= { current: initialValue });
    },
    useCallback(callback) { current.cursor++; return callback; },
    useEffect(effect, deps) {
      const instance = current;
      const index = instance.cursor++;
      const previous = instance.slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          instance.slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const api = Object.fromEntries(['getTree', 'getFolderNotes', 'getNote'].map(method => [method,
    (...args) => new Promise((resolve, reject) => requests.push({ method, args, resolve, reject })),
  ]));
  const presentation = new Proxy({}, { get: (_, name) => name });
  const imports = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-router-dom': {
      useParams: () => params,
      useNavigate: () => path => navigations.push(path),
      useLocation: () => ({ pathname: `/p/${params.notebook}${params['*'] ? `/${params['*']}` : ''}` }),
    },
    '@mui/material': new Proxy({}, { get: (_, name) => name === 'useTheme'
      ? () => ({ breakpoints: { down: () => 'mobile' } })
      : name === 'useMediaQuery' ? () => mobile : name }),
    '@mui/icons-material': presentation,
    '@mui/x-tree-view/SimpleTreeView': presentation,
    '@mui/x-tree-view/TreeItem': presentation,
    '../services/api': { publicApi: api },
    '../stores/siteStore': { useSiteStore: () => ({ siteName: 'ValeNote', showPoweredBy: false }) },
    '../constants': { PUBLIC_BASE_PATH: '/p' },
    '../components/MarkdownRenderer': 'MarkdownRenderer',
    '../components/TableOfContents': 'TableOfContents',
    '../utils/time': { formatDate: value => value },
  };
  const exports = {};
  const source = readFileSync(new URL('./PublicNotebookPage.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  runInNewContext(outputText, { exports, document: { title: '' }, require(name) {
    assert.ok(name in imports, `unexpected import: ${name}`);
    return imports[name];
  } });
  function cleanup(instance) { instance.slots.forEach(slot => slot?.cleanup?.()); }
  function render() {
    let iterations = 0;
    while (dirty) {
      assert.ok(++iterations < 20, 'render must settle');
      dirty = false;
      effects = [];
      const visited = new Map();
      function expand(node, path = 'root') {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) return node.map((child, i) => expand(child, `${path}/${i}`));
        if (typeof node.type === 'function') {
          const identity = `${path}:${node.type.name}:${node.key ?? ''}`;
          const instance = instances.get(identity) ?? { slots: [], cursor: 0 };
          visited.set(identity, instance);
          current = instance;
          instance.cursor = 0;
          return expand(node.type(node.props), `${identity}/child`);
        }
        return { ...node, props: { ...node.props, children: expand(node.props?.children, `${path}/children`) } };
      }
      tree = expand(jsx(exports.default, {}));
      for (const [identity, instance] of instances) if (!visited.has(identity)) cleanup(instance);
      instances = visited;
      // React retries a render-phase adjustment before committing its effects.
      if (!dirty) {
        runningEffects = true;
        effects.forEach(effect => effect());
        runningEffects = false;
      }
    }
  }
  function nodes(type, node = tree) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(child => nodes(type, child));
    return [...(node.type === type ? [node] : []), ...nodes(type, node.props?.children ?? null)];
  }
  t.after(() => instances.forEach(cleanup));
  render();
  return {
    requests, navigations, nodes,
    route(notebook, subPath = '') { params = { notebook, '*': subPath }; dirty = true; render(); },
    resize(value) { mobile = value; dirty = true; render(); },
    rerender() { dirty = true; render(); },
    act(callback) { callback(); render(); },
    unmount() { instances.forEach(cleanup); instances = new Map(); dirty = false; },
    mutations: () => mutations,
    synchronousEffectMutations: () => synchronousEffectMutations,
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
  };
}

const folder = (path, children = []) => ({ path, name: path.split('/').pop(), type: 'folder', children });
const file = path => ({ path, name: path.split('/').pop(), type: 'file' });
const note = path => ({ path, content: path, updated_at: '' });
const result = data => ({ data });

async function loadTree(page, children = []) {
  page.requests[0].resolve(result(folder('book', children)));
  await page.settle();
}

test('changing routes ignores an obsolete note completion', async t => {
  const page = mountPage(t, { '*': 'first' });
  await loadTree(page, [file('book/first.md'), file('book/second.md')]);
  const obsolete = page.requests[1];
  page.route('book', 'second');
  page.requests[2].resolve(result(note('book/second.md')));
  await page.settle();
  const mutations = page.mutations();
  obsolete.resolve(result(note('book/first.md')));
  await page.settle();
  assert.equal(page.mutations(), mutations, 'obsolete note must not mutate state');
  assert.equal(page.nodes('MarkdownRenderer')[0].props.notePath, 'book/second.md');
});

test('sidebar follows breakpoints without cascading effect updates and keeps manual toggles', async t => {
  const page = mountPage(t);
  await loadTree(page);
  assert.equal(page.nodes('Drawer')[0].props.open, true);
  page.act(() => page.nodes('IconButton')[0].props.onClick());
  assert.equal(page.nodes('Drawer')[0].props.open, false);
  page.rerender();
  assert.equal(page.nodes('Drawer')[0].props.open, false);
  page.resize(true);
  assert.equal(page.nodes('Drawer')[0].props.open, false);
  page.act(() => page.nodes('IconButton')[1].props.onClick());
  assert.equal(page.nodes('Drawer')[0].props.open, true);
  page.resize(false);
  assert.equal(page.nodes('Drawer')[0].props.open, true);
  page.resize(true);
  assert.equal(page.nodes('Drawer')[0].props.open, false);
  assert.equal(page.synchronousEffectMutations(), 0, 'state is ready before effects commit');
});

test('changing notebooks ignores an obsolete tree completion', async t => {
  const page = mountPage(t);
  const obsolete = page.requests[0];
  page.route('next');
  page.requests[1].resolve(result(folder('next')));
  await page.settle();
  const mutations = page.mutations();
  obsolete.resolve(result(folder('book')));
  await page.settle();
  assert.equal(page.mutations(), mutations, 'obsolete tree must not mutate state');
  assert.equal(page.nodes('TreeItem')[0].props.itemId, 'next');
});

test('root loads folder notes and selects the notebook', async t => {
  const page = mountPage(t);
  await loadTree(page);
  assert.equal(page.requests[1].method, 'getFolderNotes');
  assert.deepEqual(page.requests[1].args, ['book']);
  assert.equal(page.nodes('SimpleTreeView')[0].props.selectedItems, 'book');
  assert.deepEqual(Array.from(page.nodes('SimpleTreeView')[0].props.expandedItems), ['book']);
  page.requests[1].resolve(result([]));
  await page.settle();
  assert.equal(page.nodes('ListItemText')[0].props.primary, 'No notes in this folder');
  assert.equal(page.synchronousEffectMutations(), 0);
});

test('pretty note paths expand ancestors once and preserve manual collapses until selection changes', async t => {
  const page = mountPage(t, { '*': 'a/b/first' });
  await loadTree(page, [folder('book/a', [folder('book/a/b', [file('book/a/b/first.md'), file('book/a/b/second.md')])])]);
  const view = () => page.nodes('SimpleTreeView')[0].props;
  assert.equal(view().selectedItems, 'book/a/b/first.md');
  assert.deepEqual(page.requests[1].args, ['book', 'a/b/first.md']);
  assert.deepEqual(Array.from(view().expandedItems), ['book', 'book/a', 'book/a/b']);
  page.act(() => view().onExpandedItemsChange(null, []));
  page.rerender();
  page.resize(true);
  page.requests[1].resolve(result(note('book/a/b/first.md')));
  await page.settle();
  assert.deepEqual(Array.from(view().expandedItems), []);
  page.route('book', 'a/b/second');
  assert.equal(view().selectedItems, 'book/a/b/second.md');
  assert.deepEqual(Array.from(view().expandedItems), ['book', 'book/a', 'book/a/b']);
});

test('exact folders win over matching markdown files and links preserve ambiguous extensions', async t => {
  const page = mountPage(t, { '*': 'topic' });
  await loadTree(page, [folder('book/topic'), file('book/topic.md'), file('book/plain.md')]);
  const view = page.nodes('SimpleTreeView')[0].props;
  assert.equal(view.selectedItems, 'book/topic');
  assert.equal(page.requests[1].method, 'getFolderNotes');
  assert.deepEqual(page.requests[1].args, ['book', 'topic']);
  view.onSelectedItemsChange(null, 'book/topic.md');
  assert.equal(page.navigations.pop(), '/p/book/topic.md');
  view.onSelectedItemsChange(null, 'book/plain.md');
  assert.equal(page.navigations.pop(), '/p/book/plain');
  view.onSelectedItemsChange(null, 'book');
  assert.equal(page.navigations.pop(), '/p/book');
  page.requests[1].resolve(result([note('book/topic.md'), note('book/plain.md')]));
  await page.settle();
  page.nodes('ListItemButton')[0].props.onClick();
  assert.equal(page.navigations.pop(), '/p/book/topic.md');
  page.nodes('ListItemButton')[1].props.onClick();
  assert.equal(page.navigations.pop(), '/p/book/plain');
  page.route('book', 'topic.md');
  assert.equal(page.nodes('SimpleTreeView')[0].props.selectedItems, 'book/topic.md');
  assert.equal(page.requests[2].method, 'getNote');
});

test('unknown paths try a folder before a note and do not invent tree selection', async t => {
  const page = mountPage(t, { '*': 'unknown' });
  await loadTree(page);
  assert.equal(page.nodes('SimpleTreeView')[0].props.selectedItems, undefined);
  assert.equal(page.requests[1].method, 'getFolderNotes');
  assert.deepEqual(page.requests[1].args, ['book', 'unknown']);
  page.requests[1].reject(new Error('not a folder'));
  await page.settle();
  assert.equal(page.requests[2].method, 'getNote');
  assert.deepEqual(page.requests[2].args, ['book', 'unknown']);
  page.requests[2].resolve(result(note('book/unknown.md')));
  await page.settle();
  assert.equal(page.nodes('MarkdownRenderer')[0].props.notePath, 'book/unknown.md');
});

for (const outcome of ['resolve', 'reject']) {
  test(`obsolete tree ${outcome} after unmount never mutates state`, async t => {
    const page = mountPage(t);
    page.unmount();
    const mutations = page.mutations();
    page.requests[0][outcome](outcome === 'resolve' ? result(folder('book')) : new Error('gone'));
    await page.settle();
    assert.equal(page.mutations(), mutations);
  });

  for (const subPath of ['', 'a', 'unknown']) {
    test(`obsolete folder ${outcome} for ${subPath || 'root'} cannot publish or start fallback`, async t => {
      const page = mountPage(t, { '*': subPath });
      await loadTree(page, [folder('book/a'), file('book/current.md')]);
      const obsolete = page.requests[1];
      page.route('book', 'current');
      page.requests[2].resolve(result(note('book/current.md')));
      await page.settle();
      const mutations = page.mutations();
      obsolete[outcome](outcome === 'resolve' ? result([note('book/obsolete.md')]) : new Error('gone'));
      await page.settle();
      assert.equal(page.mutations(), mutations);
      assert.equal(page.requests.length, 3, 'obsolete folder failure must not start a note fallback');
      assert.equal(page.nodes('MarkdownRenderer')[0].props.notePath, 'book/current.md');
    });
  }

  test(`obsolete fallback note ${outcome} cannot overwrite the current folder`, async t => {
    const page = mountPage(t, { '*': 'unknown' });
    await loadTree(page);
    page.requests[1].reject(new Error('not a folder'));
    await page.settle();
    const obsolete = page.requests[2];
    page.route('book');
    page.requests[3].resolve(result([]));
    await page.settle();
    const mutations = page.mutations();
    obsolete[outcome](outcome === 'resolve' ? result(note('book/unknown.md')) : new Error('gone'));
    await page.settle();
    assert.equal(page.mutations(), mutations);
    assert.equal(page.nodes('MarkdownRenderer').length, 0);
    assert.equal(page.nodes('ListItemText')[0].props.primary, 'No notes in this folder');
  });
}

test('notebook changes reset loading and errors before the new request finishes', async t => {
  const page = mountPage(t);
  page.requests[0].reject(new Error('private'));
  await page.settle();
  assert.equal(page.nodes('Alert')[0].props.children, 'Notebook not found or not public');
  page.route('next');
  assert.equal(page.nodes('Alert').length, 0);
  assert.equal(page.nodes('CircularProgress').length, 1);
  page.requests[1].resolve(result(folder('next')));
  await page.settle();
  assert.equal(page.nodes('CircularProgress').length, 0);
  assert.equal(page.nodes('SimpleTreeView')[0].props.selectedItems, 'next');
  page.route('third');
  assert.equal(page.nodes('CircularProgress').length, 1);
  assert.equal(page.nodes('SimpleTreeView').length, 0);
  const mutations = page.mutations();
  page.requests[2].resolve(result([note('next/obsolete.md')]));
  await page.settle();
  assert.equal(page.mutations(), mutations, 'previous notebook content must not publish');
});
