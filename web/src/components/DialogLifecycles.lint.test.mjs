import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const presentation = new Proxy({}, { get: (_, name) => name });

function settingsFixture(onClose, globals = {}) {
  return mount('SettingsDialog', { open: true, onClose, notebooks: [] }, {
    'react-colorful': { HexColorPicker: 'HexColorPicker', HexColorInput: 'HexColorInput' },
    '../stores/settingsStore': { useSettingsStore: () => ({ themeMode: 'light', primaryColor: '#6782d2', setThemeMode() {} }), THEME_COLOR_OPTIONS: [] },
    '../stores/authStore': { useAuthStore: selector => selector({ user: null }) },
    '../stores/siteStore': { useSiteStore: {} },
    '../utils/time': { setTimezone() {} },
    '../services/api': { __esModule: true, default: { get: () => Promise.resolve({ data: {} }) } },
    './AgentManagement': {}, './UserManagement': {}, './RemoteStorageDialog': {},
  }, globals);
}

test('settings title exposes an accessible close button calling onClose', () => {
  let closed = 0;
  const dialog = settingsFixture(() => closed++);
  const close = dialog.nodes('IconButton').find(node => node.props['aria-label'] === 'Close settings');
  assert.ok(close, 'settings must have a close button even while loading');
  assert.equal(close.props.sx.position, 'absolute');
  close.props.onClick();
  assert.equal(closed, 1);
  dialog.unmount();
});

test('settings auto-save success feedback lasts three seconds', async () => {
  const timers = [];
  const dialog = settingsFixture(() => {}, { setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; } });
  await dialog.settle();
  dialog.nodes('Select')[0].props.onChange({ target: { value: 'dark' } });
  await dialog.settle();
  assert.equal(dialog.nodes('Alert').find(node => node.props.severity === 'success').props.children, 'Saved');
  assert.equal(timers.at(-1).delay, 3000);
  timers.at(-1).callback();
  await dialog.settle();
  assert.equal(dialog.nodes('Alert').filter(node => node.props.severity === 'success').length, 0);
  dialog.unmount();
});


// Exercise the actual TSX with hook/presentation doubles, not a browser renderer.
function mount(name, initialProps, imports = {}, globals = {}) {
  const instances = new Map();
  let current;
  let cursor;
  let dirty = true;
  let effects = [];
  let tree;
  let props = initialProps;
  let writes = 0;
  const hooks = {
    useState(initial) {
      const slots = current.slots;
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        writes++;
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useRef(initial) { return current.slots[cursor++] ??= { current: initial }; },
    useCallback(value, deps) {
      const index = cursor++;
      const previous = current.slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        current.slots[index] = { value, deps };
      }
      return current.slots[index].value;
    },
    useEffect(effect, deps) {
      const slots = current.slots;
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
  const source = readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: key => ({ react: hooks, '@mui/material': presentation, '@mui/icons-material': presentation, ...imports }[key] ?? require(key)),
    setTimeout: () => 1,
    clearTimeout() {},
    console: { error() {} },
    window: { location: { origin: 'https://example.test' } },
    ...globals,
  });
  function cleanup(instance) { instance.slots.forEach(slot => slot.cleanup?.()); }
  function resolve(node, path, seen) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((child, i) => resolve(child, `${path}.${i}`, seen));
    if (typeof node.type === 'function') {
      const identity = `${path}:${node.key ?? ''}:${node.type.name}`;
      seen.add(identity);
      current = instances.get(identity);
      if (!current) { current = { slots: [] }; instances.set(identity, current); }
      cursor = 0;
      return resolve(node.type(node.props), `${identity}.child`, seen);
    }
    return { ...node, props: { ...node.props, children: resolve(node.props?.children, `${path}.children`, seen) } };
  }
  function render() {
    let iterations = 0;
    while (dirty) {
      assert.ok(++iterations < 20, 'render must settle');
      dirty = false;
      effects = [];
      const seen = new Set();
      tree = resolve({ type: exports.default, props }, 'root', seen);
      for (const [key, instance] of instances) {
        if (!seen.has(key)) { cleanup(instance); instances.delete(key); }
      }
      effects.forEach(effect => effect());
    }
  }
  function nodes(type, node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(child => nodes(type, child));
    return [...(node.type === type ? [node] : []), ...nodes(type, node.props?.children ?? null)];
  }
  render();
  return {
    nodes: type => nodes(type, tree),
    update(next) { props = { ...props, ...next }; dirty = true; render(); },
    change(label, value) { nodes('TextField', tree).find(node => node.props.label === label).props.onChange({ target: { value } }); render(); },
    click(label) { nodes('Button', tree).find(node => node.props.children === label).props.onClick(); render(); },
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
    unmount() { instances.forEach(cleanup); instances.clear(); },
    writes: () => writes,
  };
}

for (const [name, label, initialProps, expected] of [
  ['CreateFileDialog', 'File name', { parentPath: '' }, ''],
  ['CreateFolderDialog', 'Folder name', { parentPath: '' }, ''],
  ['CreateNotebookDialog', 'Name', {}, ''],
  ['RenameDialog', 'New name', { currentName: 'original.md', type: 'file' }, 'original.md'],
]) {
  test(`${name} resets drafts and validation on reopen`, () => {
    const dialog = mount(name, { open: true, onClose() {}, onConfirm() {}, onCreated() {}, ...initialProps }, {
      '../constants': { isReservedFolderName: () => false, RESERVED_FOLDER_NAMES: [] },
      '../services/api': { notebookApi: {} },
    });
    assert.equal(dialog.nodes('TextField').find(node => node.props.label === label).props.value, expected);
    if (name !== 'CreateNotebookDialog') {
      dialog.change(label, '');
      dialog.click(name === 'RenameDialog' ? 'Rename' : 'Create');
      assert.equal(dialog.nodes('TextField').find(node => node.props.label === label).props.error, true);
    }
    dialog.change(label, 'draft');
    dialog.update({ open: false });
    dialog.update({ open: true });
    assert.equal(dialog.nodes('TextField').find(node => node.props.label === label).props.value, expected);
    assert.ok(dialog.nodes('TextField').every(node => !node.props.error));
    dialog.unmount();
  });
}

test('backlinks ignores obsolete success and finalizer after note changes', async () => {
  const requests = [];
  const dialog = mount('BacklinksPanel', { notePath: 'first.md', onNavigate() {} }, {
    '../services/api': { __esModule: true, default: { get: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) } },
  });
  dialog.update({ notePath: 'second.md' });
  const before = dialog.writes();
  requests[0].resolve({ data: [{ path: 'old.md', title: 'old' }] });
  await dialog.settle();
  assert.equal(dialog.writes(), before, 'obsolete request must not publish data or loading state');
  assert.equal(dialog.nodes('CircularProgress').length, 1);
  requests[1].resolve({ data: [{ path: 'new.md', title: 'new' }] });
  await dialog.settle();
  assert.equal(dialog.nodes('ListItemText')[0].props.primary, 'new');
  dialog.unmount();
});

for (const name of ['BacklinksPanel', 'AttachmentManagerDialog', 'VersionHistoryDialog', 'RemoteStorageDialog']) {
  for (const outcome of ['resolve', 'reject']) {
    test(`${name} suppresses obsolete ${outcome} on scope change and refetches`, async () => {
      const requests = [];
      const get = (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject }));
      const dialog = mount(name, {
        open: true, onClose() {}, notePath: 'first.md', onNavigate() {}, onRestore() {}, onInsert() {},
      }, {
        '../services/api': { __esModule: true, default: { get }, attachmentApi: { list: get } },
        '../utils/time': { formatTimestamp: () => 'timestamp' },
      });
      assert.equal(requests.length, 1);
      if (name === 'BacklinksPanel') dialog.update({ notePath: 'second.md' });
      else {
        dialog.update({ open: false });
        dialog.update({ open: true });
      }
      assert.equal(requests.length, 2, 'new scope must refetch server data');
      const before = dialog.writes();
      requests[0][outcome](outcome === 'resolve' ? { data: [] } : new Error('obsolete failure'));
      await dialog.settle();
      assert.equal(dialog.writes(), before, 'obsolete success, error and finalizer must not write state');
      requests[1].resolve({ data: [] });
      await dialog.settle();
      assert.equal(dialog.nodes('CircularProgress').length, 0);
      dialog.unmount();
    });
  }
  test(`${name} ignores response after unmount`, async () => {
    let complete;
    const get = () => new Promise(resolve => { complete = resolve; });
    const dialog = mount(name, { open: true, notePath: 'first.md', onClose() {}, onNavigate() {} }, {
      '../services/api': { __esModule: true, default: { get }, attachmentApi: { list: get } },
      '../utils/time': { formatTimestamp: () => 'timestamp' },
    });
    dialog.unmount();
    const before = dialog.writes();
    complete({ data: [] });
    await dialog.settle();
    assert.equal(dialog.writes(), before);
  });
}

test('notebook settings resets on a new notebook object but retains drafts for the same object', () => {
  const notebook = { name: 'first', description: 'original', is_public: false };
  const dialog = mount('NotebookSettingsDialog', { open: true, notebook, onClose() {}, onSave() {} }, {
    '../services/api': { notebookApi: {} },
    '../stores/siteStore': { useSiteStore: () => ({ publicBasePath: '/public' }) },
  });
  assert.equal(dialog.nodes('TextField')[0].props.value, 'original');
  dialog.change('Description', 'draft');
  dialog.update({ notebook });
  assert.equal(dialog.nodes('TextField')[0].props.value, 'draft');
  dialog.update({ notebook: { ...notebook, description: 'updated remotely' } });
  assert.equal(dialog.nodes('TextField')[0].props.value, 'updated remotely');
  dialog.unmount();
});
