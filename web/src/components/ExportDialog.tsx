import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormControlLabel,
  RadioGroup,
  Radio,
  Box,
  CircularProgress,
  Typography,
} from '@mui/material';
import { saveAs } from 'file-saver';
import MarkdownRenderer from './MarkdownRenderer';

interface Props {
  open: boolean;
  onClose: () => void;
  noteTitle: string;
  content: string;
  notePath: string;
}

export default function ExportDialog({ open, onClose, noteTitle, content, notePath }: Props) {
  const [format, setFormat] = useState<'pdf' | 'html'>('pdf');
  const [exporting, setExporting] = useState(false);
  const [ready, setReady] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (open) {
      setReady(false);
      const timer = setTimeout(() => setReady(true), 500);
      return () => clearTimeout(timer);
    }
  }, [open, content]);

  const handleExport = async () => {
    if (!previewRef.current) return;
    setExporting(true);

    try {
      const clonedContent = previewRef.current.cloneNode(true) as HTMLElement;

      if (format === 'html') {
        await convertImagesToBase64(clonedContent);
      }

      const htmlContent = generateHtmlDocument(clonedContent.innerHTML, noteTitle);

      if (format === 'pdf') {
        await printAsPdf(htmlContent);
      } else {
        downloadHtml(htmlContent, noteTitle);
      }
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  const convertImagesToBase64 = async (container: HTMLElement): Promise<void> => {
    const images = container.querySelectorAll('img');

    for (const img of Array.from(images)) {
      const src = img.src;
      if (src.startsWith('blob:') || src.startsWith('http')) {
        try {
          const response = await fetch(src);
          const blob = await response.blob();
          const dataUrl = await blobToDataUrl(blob);
          img.src = dataUrl;
        } catch (e) {
          console.warn('Failed to convert image:', src, e);
        }
      }
    }
  };

  const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const generateHtmlDocument = (bodyContent: string, title: string): string => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      line-height: 1.6;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { font-size: 2em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
    code { background: #f6f8fa; padding: 0.2em 0.4em; border-radius: 3px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f6f8fa; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }
    .MuiChip-root { display: inline-block; padding: 2px 8px; margin: 2px; border-radius: 16px; background: #e0e0e0; font-size: 0.8em; }
    @media print {
      body { max-width: none; margin: 0; padding: 20px; }
      img { max-width: 100%; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
  };

  const printAsPdf = async (htmlContent: string): Promise<void> => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '800px';
    iframe.style.height = '600px';
    document.body.appendChild(iframe);
    printFrameRef.current = iframe;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    await new Promise<void>((resolve) => {
      const checkReady = () => {
        const imgs = doc.querySelectorAll('img');
        const allLoaded = Array.from(imgs).every((img) => img.complete);
        if (allLoaded || imgs.length === 0) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      setTimeout(checkReady, 200);
    });

    await new Promise((r) => setTimeout(r, 200));
    iframe.contentWindow?.print();

    setTimeout(() => {
      if (printFrameRef.current) {
        document.body.removeChild(printFrameRef.current);
        printFrameRef.current = null;
      }
    }, 1000);
  };

  const downloadHtml = (htmlContent: string, title: string): void => {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const safeName = title.replace(/[/\\?%*:|"<>]/g, '-');
    saveAs(blob, `${safeName}.html`);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Export Note</DialogTitle>
      <DialogContent>
        <FormControl component="fieldset" sx={{ mt: 1 }}>
          <RadioGroup
            value={format}
            onChange={(e) => setFormat(e.target.value as 'pdf' | 'html')}
          >
            <FormControlLabel
              value="pdf"
              control={<Radio />}
              label="PDF (via browser print)"
            />
            <FormControlLabel
              value="html"
              control={<Radio />}
              label="HTML"
            />
          </RadioGroup>
        </FormControl>

        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {format === 'pdf'
              ? 'Images will be embedded. Use browser print dialog to save as PDF.'
              : 'Images will be embedded as base64 in the HTML file.'}
          </Typography>
        </Box>

        {/* Hidden preview for rendering */}
        <Box
          ref={previewRef}
          sx={{
            position: 'absolute',
            left: -9999,
            top: -9999,
            width: 800,
            visibility: 'hidden',
          }}
        >
          <MarkdownRenderer content={content} notePath={notePath} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={exporting}>
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          variant="contained"
          disabled={exporting || !ready}
          startIcon={exporting ? <CircularProgress size={16} /> : null}
        >
          {exporting ? 'Exporting...' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
