import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const require = createRequire(import.meta.url);
const presentation = new Proxy({}, { get: (_, name) => name });
function load(file, imports, globals = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    .replaceAll('import.meta.env.VITE_API_URL', 'undefined');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false },
  });
  const exports = {};
  runInNewContext(outputText, { exports, require: name => imports[name] ?? require(name),
    setTimeout, clearTimeout, console, ...globals });
  return exports;
}

// A source-only hook harness, not a browser or React client integration test.
// Supports dependency cleanup and render-time guarded state adjustment.
function hooks() {
  const slots = [];
  let cursor = 0;
  let pending = [];
  let changed = false;
  let phase;
  let effectWrites = 0;
  const memo = (fn, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((d, i) => !Object.is(d, slots[index].deps[i]))) {
      slots[index] = { value: fn(), deps };
    }
    return slots[index].value;
  };
  const effect = (fn, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || deps.some((d, i) => !Object.is(d, previous.deps[i]))) {
      pending.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; });
    }
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      slots[index].set ??= value => {
        if (phase === 'effect') effectWrites++;
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; changed = true; }
      };
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo: memo,
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: effect,
    useLayoutEffect: effect,
  };
  return {
    react,
    render(component, props, { commit = true, attach = () => {} } = {}) {
      let tree;
      let count = 0;
      do {
        assert.ok(++count < 20, 'render settles');
        changed = false; cursor = 0; pending = []; phase = 'render';
        tree = component(props);
      } while (changed);
      phase = 'idle';
      if (commit) {
        attach(tree);
        phase = 'effect'; pending.forEach(fn => fn()); phase = 'idle';
        if (changed) return this.render(component, props, { commit, attach });
      }
      return tree;
    },
    get effectWrites() { return effectWrites; },
    cleanup() { slots.forEach(slot => slot.cleanup?.()); },
  };
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function editorFixture(t) {
  const h = hooks();
  const views = [];
  const extension = () => ({});
  class View {
    static theme = extension;
    static updateListener = { of: fn => ({ listener: fn }) };
    static domEventHandlers = handlers => ({ handlers });
    constructor({ state }) {
      this.state = state; this.state.selection = { main: { from: 0, to: 0 } }; this.destroyed = false; this.selection = 2;
      this.listener = state.extensions.find(x => x.listener).listener;
      this.handlers = state.extensions.find(x => x.handlers).handlers;
      views.push(this);
    }
    dispatch(transaction) {
      if (transaction.changes) {
        const text = this.state.doc.toString();
        const { from, to = from, insert } = transaction.changes;
        const next = text.slice(0, from) + insert + text.slice(to);
        this.state.doc = { toString: () => next };
        this.listener({ docChanged: true, state: this.state });
      }
    }
    focus() {}
    destroy() { this.destroyed = true; }
  }
  const uploaded = [];
  const settings = { smartPasteLink: false, editorFontSize: 14 };
  const { default: Editor } = load('./MarkdownEditor.tsx', {
    react: h.react,
    '@mui/material': { ...Object.fromEntries(['Box', 'IconButton', 'Tooltip', 'Divider', 'Snackbar', 'Alert', 'CircularProgress'].map(n => [n, n])), useTheme: () => ({ palette: { mode: 'light' } }) },
    '@mui/icons-material': presentation,
    '@codemirror/state': { Compartment: class { of = extension; reconfigure = extension; }, EditorState: { create: config => ({ ...config, doc: { toString: () => config.doc } }) } },
    '@codemirror/view': { EditorView: View, keymap: { of: extension }, ...Object.fromEntries(['lineNumbers', 'highlightActiveLine', 'highlightActiveLineGutter', 'drawSelection', 'dropCursor'].map(n => [n, extension])) },
    '@codemirror/commands': { defaultKeymap: [], historyKeymap: [], history: extension },
    '@codemirror/lang-markdown': { markdown: extension },
    '@codemirror/language-data': {},
    '@codemirror/language': { syntaxHighlighting: extension, HighlightStyle: { define: extension }, bracketMatching: extension },
    '@lezer/highlight': { tags: {} },
    '../services/api': { attachmentApi: { upload: async (path, file) => { uploaded.push({ path, file }); return { data: { path: './file.png' } }; } } },
    '../stores/settingsStore': { useSettingsStore: selector => selector(settings) },
  });
  t.after(() => h.cleanup());
  return { views, uploaded, settings,
    render(props) { return h.render(Editor, props, { attach: tree => {
      for (const node of nodes(tree, n => n.type === 'Box' && n.props.ref)) node.props.ref.current = {};
    } }); },
  };
}

test('CodeMirror keeps its view and selection while using the latest onChange callback', t => {
  const editor = editorFixture(t);
  const old = [], latest = [];
  editor.render({ value: 'draft', onChange: value => old.push(value), notePath: 'book/a.md' });
  const view = editor.views[0];
  editor.render({ value: 'draft', onChange: value => latest.push(value), notePath: 'book/a.md' });
  view.dispatch({ changes: { from: 5, to: 5, insert: '!' } });
  assert.deepEqual(old, []);
  assert.deepEqual(latest, ['draft!']);
  editor.render({ value: 'draft!', onChange: value => latest.push(value), notePath: 'book/a.md' });
  editor.settings.editorFontSize = 18;
  editor.render({ value: 'draft!', onChange: value => latest.push(value), notePath: 'book/b.md' });
  assert.equal(editor.views.length, 1);
  assert.equal(view.destroyed, false);
  assert.equal(view.selection, 2);
});

test('CodeMirror paste uploads use the latest note path without remounting', async t => {
  const editor = editorFixture(t);
  const props = { value: '', onChange() {}, notePath: 'book/a.md' };
  editor.render(props);
  editor.render({ ...props, notePath: 'book/b.md' });
  const file = { name: 'image.png', size: 10 };
  editor.views[0].handlers.paste({ preventDefault() {}, clipboardData: { items: [{ type: 'image/png', getAsFile: () => file }] } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(editor.uploaded[0].path, 'book/b.md');
  assert.equal(editor.views.length, 1);
});

function rendererModule(react, extra = {}) {
  return load('./MarkdownRenderer.tsx', {
    react,
    '@mui/material': { ...Object.fromEntries(['Box', 'Table', 'TableBody', 'TableRow', 'TableCell', 'Chip', 'CircularProgress', 'IconButton', 'Tooltip', 'Typography'].map(n => [n, n])), ...(react === React ? { Box: ({ children }) => React.createElement('div', null, children) } : {}), useTheme: () => ({ palette: { mode: 'light' } }) },
    '@mui/icons-material/ContentCopy': 'copy', '@mui/icons-material/Check': 'check',
    'react-markdown': { default: ReactMarkdown }, 'remark-gfm': { default: remarkGfm },
    'react-syntax-highlighter': {}, 'react-syntax-highlighter/dist/esm/styles/prism': {},
    '../services/api': { default: { get: () => new Promise(() => {}) } }, ...extra,
  }, { URL: { createObjectURL: () => 'blob:test' } });
}

test('heading indices belong to each parsed document, not the order React renders headings', () => {
  const Renderer = rendererModule(React).default;
  const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(Renderer, { content: '# First\n\n## Second', isPublic: true }),
    React.createElement(Renderer, { content: '# Other\n\n### Last', isPublic: true })));
  assert.deepEqual([...markup.matchAll(/data-heading-index="(\d+)"/g)].map(m => m[1]), ['0', '1', '0', '1']);
});

test('relative attachment URLs follow note path and public notebook changes', () => {
  const h = hooks();
  const Renderer = rendererModule(h.react).default;
  const source = './asset%20name.png';
  const image = props => {
    const tree = h.render(Renderer, { content: '', ...props });
    return nodes(tree, n => n.type === ReactMarkdown)[0].props.components.img({ src: source });
  };
  assert.equal(image({ notePath: 'book/folder/note.md' }).props.src, '/api/v1/attachments/book/folder/asset%20name.png');
  assert.equal(image({ notePath: 'other/note.md' }).props.src, '/api/v1/attachments/other/asset%20name.png');
  assert.equal(image({ notePath: 'book/folder/note.md', isPublic: true, notebook: 'book' }).props.src, '/api/v1/public/book/attachment/folder/asset%20name.png');
  h.cleanup();
});

test('renderer callbacks can be evaluated out of heading order without changing their anchors', () => {
  const h = hooks();
  const Renderer = rendererModule(h.react).default;
  const tree = h.render(Renderer, { content: '# First\n\n## Second', isPublic: true });
  const markdown = nodes(tree, n => n.type === ReactMarkdown)[0];
  if (markdown.props.components.h1) {
    const first = markdown.props.components.h1({ children: 'First', node: { properties: { 'data-heading-index': 0 } } });
    const replay = markdown.props.components.h1({ children: 'First', node: { properties: { 'data-heading-index': 0 } } });
    assert.equal(first.props['data-heading-index'], replay.props['data-heading-index']);
  } else {
    const markup = renderToStaticMarkup(React.createElement(ReactMarkdown, markdown.props));
    assert.match(markup, /data-heading-index="0"/);
    assert.match(markup, /data-heading-index="1"/);
  }
});

test('authenticated images reset loading, ignore obsolete requests and recover after errors', async () => {
  let current = hooks();
  const react = new Proxy({}, { get: (_, name) => current.react[name] });
  const requests = [];
  const Renderer = rendererModule(react, { '../services/api': { default: {
    get: path => new Promise((resolve, reject) => requests.push({ path, resolve, reject })),
  } } }).default;
  const outer = current.render(Renderer, { content: '' });
  const Image = nodes(outer, n => n.type === ReactMarkdown)[0].props.components.img({ src: 'first' }).type;
  current = hooks();
  const render = src => current.render(Image, { src });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  assert.equal(render('first').type, 'CircularProgress');
  requests[0].reject(new Error('failed'));
  await settle();
  assert.match(render('first').props.children, /加载失败/);
  assert.equal(render('second').type, 'CircularProgress');
  assert.equal(current.effectWrites, 0, 'loading is derived, not reset in an effect');
  render('third');
  requests[1].resolve({ data: 'obsolete' });
  await settle();
  assert.equal(render('third').type, 'CircularProgress');
  requests[2].resolve({ data: 'current' });
  await settle();
  assert.equal(render('third').type, 'img');
  assert.equal(render('third').props.src, 'blob:test');
  assert.equal(render(undefined).type, 'Box');
  assert.equal(render('third').type, 'img', 'cached image is available immediately');
  assert.equal(render('/api/v1/attachments/%broken').type, 'Box');
  assert.equal(current.effectWrites, 0, 'malformed paths are derived failures, not synchronous effect writes');
  current.cleanup();
});

test('note save success feedback lasts three seconds', async () => {
  const h = hooks();
  const timers = [];
  const store = { updateNote: async () => {}, forceUpdateNote() {}, loadNote() {}, setDirtyChecker() {}, clearDirtyChecker() {} };
  const { default: Editor } = load('./NoteEditor.tsx', {
    react: h.react, '@mui/material': presentation, '@mui/icons-material': presentation,
    '../stores/noteStore': { useNoteStore: () => store, ConflictError: class extends Error {} },
    './MarkdownEditor': {}, './MarkdownRenderer': {}, './VersionHistoryDialog': {},
    './AttachmentManagerDialog': {}, './ExportDialog': {}, './TableOfContents': {},
    '../utils/time': { formatTimestamp: value => value },
  }, {
    localStorage: { getItem: () => 'edit' },
    window: { addEventListener() {}, removeEventListener() {} },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
  });
  const props = { note: { path: 'book/test.md', content: 'saved text' } };
  let tree = h.render(Editor, props);
  await nodes(tree, node => node.type === 'IconButton' && node.props.onClick?.constructor.name === 'AsyncFunction')[0].props.onClick();
  tree = h.render(Editor, props);
  assert.equal(nodes(tree, node => node.type === 'Box' && node.props.sx?.transform === 'scaleX(1)').length, 1);
  assert.equal(timers.at(-1).delay, 3000);
  timers.at(-1).callback();
  tree = h.render(Editor, props);
  assert.equal(nodes(tree, node => node.type === 'Box' && node.props.sx?.transform === 'scaleX(1)').length, 0);
  h.cleanup();
});

test('note prop changes are reflected before effects and unchanged props preserve the draft', () => {
  const h = hooks();
  let checker;
  const events = new Map();
  const store = { updateNote() {}, forceUpdateNote() {}, loadNote() {},
    setDirtyChecker: fn => { checker = fn; }, clearDirtyChecker() {} };
  const MarkdownEditor = () => null;
  const { default: Editor } = load('./NoteEditor.tsx', {
    react: h.react, '@mui/material': presentation, '@mui/icons-material': presentation,
    '../stores/noteStore': { useNoteStore: () => store, ConflictError: class extends Error {} },
    './MarkdownEditor': { default: MarkdownEditor }, './MarkdownRenderer': {},
    './VersionHistoryDialog': {}, './AttachmentManagerDialog': {}, './ExportDialog': {}, './TableOfContents': {},
    '../utils/time': { formatTimestamp: value => value },
  }, { localStorage: { getItem: () => 'edit' }, window: { addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) } });
  let props = { note: { path: 'book/a.md', content: 'first' } };
  let tree = h.render(Editor, props);
  nodes(tree, n => n.type === MarkdownEditor)[0].props.onChange('draft');
  tree = h.render(Editor, { ...props, note: { ...props.note, title: 'renamed' } });
  assert.equal(nodes(tree, n => n.type === MarkdownEditor)[0].props.value, 'draft');
  assert.equal(checker(), true);
  let prevented = false;
  events.get('beforeunload')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  props = { note: { path: 'book/b.md', content: 'second' } };
  tree = h.render(Editor, props, { commit: false });
  assert.equal(nodes(tree, n => n.type === MarkdownEditor)[0].props.value, 'second');
  assert.equal(h.effectWrites, 0, 'prop synchronization must not enqueue effect state updates');
  h.render(Editor, props);
  assert.equal(checker(), false);
  tree = h.render(Editor, { note: { ...props.note, content: 'server update' } }, { commit: false });
  assert.equal(nodes(tree, n => n.type === MarkdownEditor)[0].props.value, 'server update');
  h.cleanup();
});
