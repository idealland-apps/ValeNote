import React, { useEffect, useCallback, useRef } from 'react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { Box, Snackbar, Alert } from '@mui/material';
import { attachmentApi } from '../services/api';

interface Props {
  value: string;
  onChange: (value: string) => void;
  notePath?: string;
}

function MilkdownEditorInner({ value, onChange, notePath, onUploadError, onUploading }: Props & { onUploadError: (msg: string) => void; onUploading: (v: boolean) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    if (!notePath) {
      onUploadError('Cannot upload: note path not available');
      return null;
    }
    if (!file.type.startsWith('image/')) {
      onUploadError('Only image files are supported');
      return null;
    }
    if (file.size > 10 * 1024 * 1024) {
      onUploadError('File too large (max 10MB)');
      return null;
    }
    try {
      onUploading(true);
      const res = await attachmentApi.upload(notePath, file);
      return res.data.path;
    } catch {
      onUploadError('Failed to upload image');
      return null;
    } finally {
      onUploading(false);
    }
  }, [notePath, onUploadError, onUploading]);

  const insertImageMarkdown = useCallback((path: string) => {
    const markdown = `![](${path})`;
    onChange(value + '\n' + markdown);
  }, [onChange, value]);

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const path = await uploadFile(file);
          if (path) insertImageMarkdown(path);
        }
        return;
      }
    }
  }, [uploadFile, insertImageMarkdown]);

  const handleDrop = useCallback(async (e: DragEvent) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        const path = await uploadFile(file);
        if (path) insertImageMarkdown(path);
        return;
      }
    }
  }, [uploadFile, insertImageMarkdown]);

  const handleDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
    }
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const pasteHandler = handlePaste as unknown as EventListener;
    const dropHandler = handleDrop as unknown as EventListener;
    const dragOverHandler = handleDragOver as unknown as EventListener;

    el.addEventListener('paste', pasteHandler);
    el.addEventListener('drop', dropHandler);
    el.addEventListener('dragover', dragOverHandler);

    return () => {
      el.removeEventListener('paste', pasteHandler);
      el.removeEventListener('drop', dropHandler);
      el.removeEventListener('dragover', dragOverHandler);
    };
  }, [handlePaste, handleDrop, handleDragOver]);

  const { get } = useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          onChange(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
  );

  useEffect(() => {
    const editor = get();
    if (editor) {
      editor.action((ctx) => {
        const view = ctx.get(rootCtx);
        if (view && typeof view === 'object' && 'updateState' in view) {
          // Editor content is managed via defaultValueCtx on creation
        }
      });
    }
  }, [value, get]);

  return <div ref={editorRef}><Milkdown /></div>;
}

export default function MilkdownEditor({ value, onChange, notePath }: Props) {
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);

  return (
    <Box
      sx={{
        height: '100%',
        position: 'relative',
        '& .milkdown': {
          height: '100%',
          '& .editor': {
            height: '100%',
            outline: 'none',
            '& > *': { marginBottom: '0.5em' },
          },
        },
        '& .ProseMirror': {
          height: '100%',
          outline: 'none',
          padding: 2,
          '& h1': { fontSize: '2em', fontWeight: 'bold', marginTop: '0.5em' },
          '& h2': { fontSize: '1.5em', fontWeight: 'bold', marginTop: '0.5em' },
          '& h3': { fontSize: '1.25em', fontWeight: 'bold', marginTop: '0.5em' },
          '& p': { marginBottom: '0.5em' },
          '& ul, & ol': { paddingLeft: '1.5em' },
          '& code': { backgroundColor: '#f5f5f5', padding: '0.2em 0.4em', borderRadius: '3px' },
          '& pre': { backgroundColor: '#f5f5f5', padding: '1em', borderRadius: '4px', overflow: 'auto' },
          '& blockquote': { borderLeft: '3px solid #ccc', paddingLeft: '1em', color: '#666' },
          '& a': { color: '#1976d2' },
          '& table': { borderCollapse: 'collapse', width: '100%' },
          '& th, & td': { border: '1px solid #ddd', padding: '0.5em' },
          '& img': { maxWidth: '100%', height: 'auto' },
        },
      }}
    >
      {uploading && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            bgcolor: 'primary.main',
            color: 'white',
            px: 2,
            py: 0.5,
            borderRadius: 1,
            fontSize: '0.875rem',
            zIndex: 10,
          }}
        >
          Uploading...
        </Box>
      )}
      <MilkdownProvider>
        <MilkdownEditorInner
          value={value}
          onChange={onChange}
          notePath={notePath}
          onUploadError={setUploadError}
          onUploading={setUploading}
        />
      </MilkdownProvider>
      <Snackbar
        open={!!uploadError}
        autoHideDuration={4000}
        onClose={() => setUploadError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setUploadError(null)}>
          {uploadError}
        </Alert>
      </Snackbar>
    </Box>
  );
}
