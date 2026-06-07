import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { Box, IconButton, Tooltip, Divider, Snackbar, Alert, CircularProgress, useTheme } from '@mui/material';
import {
  FormatBold,
  FormatItalic,
  StrikethroughS,
  Code,
  FormatQuote,
  FormatListBulleted,
  FormatListNumbered,
  Link,
  Image,
  AttachFile,
  Title,
} from '@mui/icons-material';
import { attachmentApi } from '../services/api';
import { useSettingsStore } from '../stores/settingsStore';

interface Props {
  value: string;
  onChange: (value: string) => void;
  notePath?: string;
}

const createEditorTheme = (isDark: boolean) => EditorView.theme({
  '&': {
    height: '100%',
    ...(isDark && { backgroundColor: '#1e1e1e' }),
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.6',
  },
  '.cm-content': {
    padding: '8px 0',
    caretColor: isDark ? '#fff' : '#000',
  },
  '.cm-gutters': {
    backgroundColor: isDark ? '#252526' : '#f5f5f5',
    color: isDark ? '#858585' : '#999',
    border: 'none',
    borderRight: isDark ? '1px solid #3c3c3c' : '1px solid #e0e0e0',
  },
  '.cm-activeLineGutter': {
    backgroundColor: isDark ? '#2a2d2e' : '#e8e8e8',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-selectionBackground': {
    backgroundColor: isDark ? '#264f78 !important' : '#b3d4fc !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: isDark ? '#264f78 !important' : '#b3d4fc !important',
  },
  '.cm-cursor': {
    borderLeftColor: isDark ? '#fff' : '#000',
  },
}, { dark: isDark });

const createHighlightStyle = (isDark: boolean) => HighlightStyle.define([
  { tag: tags.heading1, fontWeight: 'bold', color: isDark ? '#dcdcaa' : undefined },
  { tag: tags.heading2, fontWeight: 'bold', color: isDark ? '#dcdcaa' : undefined },
  { tag: tags.heading3, fontWeight: 'bold', color: isDark ? '#dcdcaa' : undefined },
  { tag: tags.heading4, fontWeight: 'bold', color: isDark ? '#dcdcaa' : undefined },
  { tag: tags.heading5, fontWeight: 'bold', color: isDark ? '#dcdcaa' : undefined },
  { tag: tags.heading6, fontWeight: 'bold', color: isDark ? '#dcdcaa' : undefined },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: isDark ? '#4fc3f7' : '#1976d2' },
  { tag: tags.url, color: isDark ? '#4fc3f7' : '#1976d2' },
  { tag: tags.monospace, fontFamily: 'monospace', color: isDark ? '#ce9178' : undefined },
  { tag: tags.quote, color: isDark ? '#6a9955' : '#666', fontStyle: 'italic' },
  { tag: tags.meta, color: isDark ? '#808080' : '#808080' },
  { tag: tags.processingInstruction, color: isDark ? '#808080' : '#808080' },
  { tag: tags.comment, color: isDark ? '#6a9955' : '#808080' },
  { tag: tags.keyword, color: isDark ? '#569cd6' : '#07a' },
  { tag: tags.string, color: isDark ? '#ce9178' : '#690' },
  { tag: tags.number, color: isDark ? '#b5cea8' : '#905' },
]);

const themeCompartment = new Compartment();

export default function MarkdownEditor({ value, onChange, notePath }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const notePathRef = useRef(notePath);
  const smartPasteLink = useSettingsStore((s) => s.smartPasteLink);
  const smartPasteLinkRef = useRef(smartPasteLink);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const editorThemeExtension = useMemo(
    () => [createEditorTheme(isDark), syntaxHighlighting(createHighlightStyle(isDark))],
    [isDark]
  );

  useEffect(() => {
    smartPasteLinkRef.current = smartPasteLink;
  }, [smartPasteLink]);

  useEffect(() => {
    notePathRef.current = notePath;
  }, [notePath]);

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    const currentNotePath = notePathRef.current;
    if (!currentNotePath) {
      setError('请先保存笔记后再上传文件');
      return null;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('文件过大 (最大 50MB)');
      return null;
    }
    try {
      setUploading(true);
      const res = await attachmentApi.upload(currentNotePath, file);
      return res.data.path;
    } catch {
      setError('上传失败');
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  const insertText = useCallback((text: string, selectFrom?: number, selectTo?: number) => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: selectFrom !== undefined ? { anchor: from + selectFrom, head: from + (selectTo ?? selectFrom) } : undefined,
    });
    view.focus();
  }, []);

  const wrapSelection = useCallback((prefix: string, suffix: string) => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const wrapped = `${prefix}${selected}${suffix}`;
    view.dispatch({
      changes: { from, to, insert: wrapped },
      selection: { anchor: from + prefix.length, head: from + prefix.length + selected.length },
    });
    view.focus();
  }, []);

  const insertAtLineStart = useCallback((prefix: string) => {
    const view = viewRef.current;
    if (!view) return;
    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    view.dispatch({
      changes: { from: line.from, to: line.from, insert: prefix },
    });
    view.focus();
  }, []);

  const handleBold = useCallback(() => wrapSelection('**', '**'), [wrapSelection]);
  const handleItalic = useCallback(() => wrapSelection('*', '*'), [wrapSelection]);
  const handleStrikethrough = useCallback(() => wrapSelection('~~', '~~'), [wrapSelection]);
  const handleCode = useCallback(() => wrapSelection('`', '`'), [wrapSelection]);
  const handleQuote = useCallback(() => insertAtLineStart('> '), [insertAtLineStart]);
  const handleBulletList = useCallback(() => insertAtLineStart('- '), [insertAtLineStart]);
  const handleNumberedList = useCallback(() => insertAtLineStart('1. '), [insertAtLineStart]);

  const handleLink = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    if (selected) {
      const text = `[${selected}](url)`;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 },
      });
    } else {
      insertText('[链接文字](url)', 1, 5);
    }
    view.focus();
  }, [insertText]);

  const handleHeading = useCallback((level: number) => {
    const prefix = '#'.repeat(level) + ' ';
    insertAtLineStart(prefix);
  }, [insertAtLineStart]);

  const insertImageMarkdown = useCallback((path: string, filename: string) => {
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(filename);
    const mdText = isImage ? `![${filename}](${path})` : `[${filename}](${path})`;
    insertText('\n' + mdText + '\n');
  }, [insertText]);

  const handleImageUpload = useCallback(async (file: File) => {
    const path = await uploadFile(file);
    if (path) {
      insertImageMarkdown(path, file.name);
    }
  }, [uploadFile, insertImageMarkdown]);

  const handleImageClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAttachmentClick = useCallback(() => {
    attachmentInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of files) {
      await handleImageUpload(file);
    }
    e.target.value = '';
  }, [handleImageUpload]);

  useEffect(() => {
    if (!editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    });

    const handlePaste = EditorView.domEventHandlers({
      paste: (event, view) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) handleImageUpload(file);
            return true;
          }
        }

        if (smartPasteLinkRef.current) {
          const html = event.clipboardData?.getData('text/html');
          if (html) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const link = doc.querySelector('a');
            if (link?.href && link.textContent?.trim()) {
              const title = link.textContent.trim();
              const url = link.href;
              if (title !== url) {
                event.preventDefault();
                const mdLink = `[${title}](${url})`;
                const { from, to } = view.state.selection.main;
                view.dispatch({
                  changes: { from, to, insert: mdLink },
                  selection: { anchor: from + mdLink.length },
                });
                return true;
              }
            }
          }
        }

        return false;
      },
      drop: (event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        for (const file of files) {
          if (file.type.startsWith('image/') || file.type.startsWith('application/') || file.type.startsWith('text/')) {
            event.preventDefault();
            handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        dropCursor(),
        bracketMatching(),
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        themeCompartment.of(editorThemeExtension),
        updateListener,
        handlePaste,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.reconfigure(editorThemeExtension),
    });
  }, [editorThemeExtension]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: value },
      });
    }
  }, [value]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          backgroundColor: 'action.hover',
          flexWrap: 'wrap',
        }}
      >
        <Tooltip title="标题 1">
          <IconButton size="small" onClick={() => handleHeading(1)}>
            <Title fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="标题 2">
          <IconButton size="small" onClick={() => handleHeading(2)}>
            <Box component="span" sx={{ fontSize: '12px', fontWeight: 'bold' }}>H2</Box>
          </IconButton>
        </Tooltip>
        <Tooltip title="标题 3">
          <IconButton size="small" onClick={() => handleHeading(3)}>
            <Box component="span" sx={{ fontSize: '12px', fontWeight: 'bold' }}>H3</Box>
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="加粗 (Ctrl+B)">
          <IconButton size="small" onClick={handleBold}>
            <FormatBold fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="斜体 (Ctrl+I)">
          <IconButton size="small" onClick={handleItalic}>
            <FormatItalic fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="删除线">
          <IconButton size="small" onClick={handleStrikethrough}>
            <StrikethroughS fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="代码">
          <IconButton size="small" onClick={handleCode}>
            <Code fontSize="small" />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="引用">
          <IconButton size="small" onClick={handleQuote}>
            <FormatQuote fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="无序列表">
          <IconButton size="small" onClick={handleBulletList}>
            <FormatListBulleted fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="有序列表">
          <IconButton size="small" onClick={handleNumberedList}>
            <FormatListNumbered fontSize="small" />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="链接">
          <IconButton size="small" onClick={handleLink}>
            <Link fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="上传图片">
          <IconButton size="small" onClick={handleImageClick}>
            <Image fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="上传附件">
          <IconButton size="small" onClick={handleAttachmentClick}>
            <AttachFile fontSize="small" />
          </IconButton>
        </Tooltip>
        {uploading && <CircularProgress size={20} sx={{ ml: 1 }} />}
      </Box>
      <Box
        ref={editorRef}
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          '& .cm-editor': {
            height: '100%',
            fontSize: `${editorFontSize}px`,
          },
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        multiple
      />
      <input
        ref={attachmentInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        multiple
      />
      <Snackbar
        open={!!error}
        autoHideDuration={4000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
