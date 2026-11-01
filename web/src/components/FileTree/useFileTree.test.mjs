import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const EXPANDED_KEY = 'valenote_expanded_folders';
const files = [
  { path: 'first', type: 'folder' },
  { path: 'first/nested/deeper/note.md', type: 'file' },
  { path: 'second', type: 'folder' },
  { path: 'second/nested/note.md', type: 'file' },
];
const expanded = ['first', 'first/nested', 'first/nested/deeper', 'second', 'second/nested'];

function mountTree(items = files, storage = new Map([[EXPANDED_KEY, JSON.stringify(expanded)]])) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const memo = (factory, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      slots[index] = { value: factory(), deps };
    }
    return slots[index].value;
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        slots[index].value = typeof value === 'function' ? value(slots[index].value) : value;
      }];
    },
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        slots[index] = { deps };
        effects.push(effect);
      }
    },
  };
  const source = readFileSync(new URL('./useFileTree.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: name => {
      if (name === 'react') return react;
      if (name === '../../constants') {
        return { containsReservedFolder: path => path.split('/').includes('attachments') };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  function render(nextItems = items) {
    items = nextItems;
    cursor = 0;
    effects = [];
    const result = exports.useFileTree(items);
    effects.forEach(effect => effect());
    return result;
  }
  render();
  return { render, storage };
}

test('collapse removes only notebook roots and persists every expanded subfolder', () => {
  const tree = mountTree();
  tree.render().collapseNotebooks();
  const expected = ['first/nested', 'first/nested/deeper', 'second/nested'];
  assert.deepEqual(Array.from(tree.render().expandedIds), expected);
  assert.deepEqual(JSON.parse(tree.storage.get(EXPANDED_KEY)), expected);
  tree.render().collapseNotebooks();
  assert.deepEqual(Array.from(tree.render().expandedIds), expected, 'repeated collapse is harmless');
});

test('reopening a notebook restores its child expansion without opening other notebooks', () => {
  const tree = mountTree();
  tree.render().collapseNotebooks();
  const collapsed = tree.render();
  collapsed.handleExpandedChange(null, [...collapsed.expandedIds, 'first']);
  assert.deepEqual(Array.from(tree.render().expandedIds), [
    'first/nested', 'first/nested/deeper', 'second/nested', 'first',
  ]);
});

test('refresh and remount retain collapsed roots and remembered subfolders', () => {
  const tree = mountTree();
  tree.render().collapseNotebooks();
  const refreshed = [...files, { path: 'first/new.md', type: 'file' }];
  tree.render(refreshed);
  const expected = ['first/nested', 'first/nested/deeper', 'second/nested'];
  assert.deepEqual(Array.from(tree.render().expandedIds), expected);
  const remounted = mountTree(refreshed, tree.storage);
  assert.deepEqual(Array.from(remounted.render().expandedIds), expected);
});

test('collapse recognizes implicit notebook roots and handles an empty tree', () => {
  const tree = mountTree([{ path: 'first/nested/deeper/note.md', type: 'file' }]);
  tree.render().collapseNotebooks();
  assert.deepEqual(Array.from(tree.render().expandedIds), ['first/nested', 'first/nested/deeper']);
  const empty = mountTree([], new Map());
  empty.render().collapseNotebooks();
  assert.equal(empty.render().expandedIds.length, 0);
});
