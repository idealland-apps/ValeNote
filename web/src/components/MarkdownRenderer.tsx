import { useMemo, useState, useEffect } from 'react';
import { Box, Table, TableBody, TableRow, TableCell, Chip, CircularProgress } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../services/api';

interface Props {
  content: string;
  onTagClick?: (tag: string) => void;
  notePath?: string;
  isPublic?: boolean;
  notebook?: string;
}

interface Frontmatter {
  tags?: string[];
  [key: string]: string | string[] | undefined;
}

function parseTags(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map(t => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map(t => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return trimmed ? [trimmed.replace(/^["']|["']$/g, '')] : [];
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter | null; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    const altMatch = content.match(/^\*{3}\s*\n([\s\S]*?)\n-{3,}\s*\n([\s\S]*)$/);
    if (!altMatch) {
      return { frontmatter: null, body: content };
    }
    const [, yaml, body] = altMatch;
    return { frontmatter: parseYaml(yaml), body };
  }
  const [, yaml, body] = match;
  return { frontmatter: parseYaml(yaml), body };
}

function parseYaml(yaml: string): Frontmatter | null {
  const frontmatter: Frontmatter = {};
  const lines = yaml.split('\n');
  let currentKey = '';

  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0 && !line.startsWith(' ') && !line.startsWith('-')) {
      currentKey = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (currentKey === 'tags') {
        if (value) {
          frontmatter.tags = parseTags(value);
        } else {
          frontmatter.tags = [];
        }
      } else if (value) {
        frontmatter[currentKey] = value;
      }
    } else if (line.trim().startsWith('-') && currentKey === 'tags') {
      const tag = line.trim().slice(1).trim().replace(/^["']|["']$/g, '');
      if (tag) {
        frontmatter.tags = [...(frontmatter.tags || []), tag];
      }
    }
  }

  return Object.keys(frontmatter).length > 0 ? frontmatter : null;
}

const markdownStyles = {
  '& h1': { fontSize: '2em', fontWeight: 'bold', mt: 2, mb: 1, borderBottom: '1px solid', borderColor: 'divider', pb: 1 },
  '& h2': { fontSize: '1.5em', fontWeight: 'bold', mt: 2, mb: 1, borderBottom: '1px solid', borderColor: 'divider', pb: 0.5 },
  '& h3': { fontSize: '1.25em', fontWeight: 'bold', mt: 2, mb: 1 },
  '& p': { mb: 1.5, lineHeight: 1.7 },
  '& code': { bgcolor: 'grey.100', px: 0.5, borderRadius: 0.5, fontFamily: 'monospace', fontSize: '0.9em' },
  '& pre': { bgcolor: 'grey.100', p: 2, borderRadius: 1, overflow: 'auto', '& code': { bgcolor: 'transparent', p: 0 } },
  '& blockquote': { borderLeft: '3px solid', borderColor: 'grey.300', pl: 2, ml: 0, color: 'text.secondary' },
  '& ul, & ol': { pl: 3, mb: 1.5 },
  '& li': { mb: 0.5 },
  '& table': { borderCollapse: 'collapse', width: '100%', mb: 2 },
  '& th, & td': { border: '1px solid', borderColor: 'divider', p: 1 },
  '& img': { maxWidth: '100%' },
  '& a': { color: 'primary.main' },
};

const blobCache = new Map<string, string>();

function AuthenticatedImage({ src, alt }: { src?: string; alt?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setLoading(false);
      return;
    }

    if (blobCache.has(src)) {
      setBlobUrl(blobCache.get(src)!);
      setLoading(false);
      return;
    }

    let cancelled = false;

    api.get(src.replace(/^.*\/api\/v1/, ''), { responseType: 'blob' })
      .then(response => {
        if (cancelled) return;
        const url = URL.createObjectURL(response.data);
        blobCache.set(src, url);
        setBlobUrl(url);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (loading) {
    return <CircularProgress size={20} />;
  }

  if (error || !blobUrl) {
    return <Box component="span" sx={{ color: 'error.main' }}>[图片加载失败]</Box>;
  }

  return <img src={blobUrl} alt={alt || ''} style={{ maxWidth: '100%' }} />;
}

function AuthenticatedLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const handleClick = async (e: React.MouseEvent) => {
    if (!href) return;

    const apiBase = import.meta.env.VITE_API_URL || '/api/v1';
    if (!href.startsWith(apiBase + '/attachments/') && !href.startsWith('/api/v1/attachments/')) {
      return;
    }

    e.preventDefault();

    try {
      const response = await api.get(href.replace(apiBase, ''), { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const filename = href.split('/').pop() || 'download';
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      console.error('Failed to download attachment');
    }
  };

  return (
    <a href={href} onClick={handleClick}>
      {children}
    </a>
  );
}

function PublicLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const handleClick = async (e: React.MouseEvent) => {
    if (!href) return;

    const apiBase = import.meta.env.VITE_API_URL || '/api/v1';
    if (!href.startsWith(apiBase + '/public/') && !href.startsWith('/api/v1/public/')) {
      return;
    }

    e.preventDefault();

    try {
      const response = await fetch(href);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = href.split('/').pop() || 'download';
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      console.error('Failed to download attachment');
    }
  };

  return (
    <a href={href} onClick={handleClick}>
      {children}
    </a>
  );
}

export default function MarkdownRenderer({ content, onTagClick, notePath, isPublic, notebook }: Props) {
  const { frontmatter, body } = useMemo(() => parseFrontmatter(content), [content]);

  const resolveUrl = useMemo(() => {
    if (!notePath) return (url: string) => url;

    const noteDir = notePath.substring(0, notePath.lastIndexOf('/'));

    return (url: string) => {
      if (!url.startsWith('./') && !url.startsWith('../')) {
        return url;
      }

      let resolvedPath: string;
      if (url.startsWith('./')) {
        resolvedPath = noteDir ? `${noteDir}/${url.slice(2)}` : url.slice(2);
      } else {
        const parts = noteDir.split('/');
        let relPath = url;
        while (relPath.startsWith('../')) {
          parts.pop();
          relPath = relPath.slice(3);
        }
        resolvedPath = parts.length > 0 ? `${parts.join('/')}/${relPath}` : relPath;
      }

      return resolvedPath;
    };
  }, [notePath]);

  const transformUrl = useMemo(() => {
    const apiBase = import.meta.env.VITE_API_URL || '/api/v1';

    return (url: string) => {
      const resolvedPath = resolveUrl(url);
      if (resolvedPath === url && !url.startsWith('./') && !url.startsWith('../')) {
        return url;
      }

      const cleanPath = resolvedPath.startsWith('/') ? resolvedPath.slice(1) : resolvedPath;

      if (isPublic && notebook) {
        const pathWithoutNotebook = cleanPath.startsWith(notebook + '/')
          ? cleanPath.slice(notebook.length + 1)
          : cleanPath;
        return `${apiBase}/public/${notebook}/attachment/${pathWithoutNotebook}`;
      }
      return `${apiBase}/attachments/${cleanPath}`;
    };
  }, [resolveUrl, isPublic, notebook]);

  const components = useMemo(() => {
    if (isPublic) {
      return {
        a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
          const resolvedHref = href ? transformUrl(href) : undefined;
          return <PublicLink href={resolvedHref}>{children}</PublicLink>;
        },
      };
    }
    return {
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        const resolvedSrc = src ? transformUrl(src) : undefined;
        return <AuthenticatedImage src={resolvedSrc} alt={alt} />;
      },
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        const resolvedHref = href ? transformUrl(href) : undefined;
        return <AuthenticatedLink href={resolvedHref}>{children}</AuthenticatedLink>;
      },
    };
  }, [isPublic, transformUrl]);

  const renderValue = (key: string, value: string | string[] | undefined) => {
    if (key === 'tags' && Array.isArray(value)) {
      return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {value.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              variant="outlined"
              onClick={onTagClick ? () => onTagClick(tag) : undefined}
              sx={{ cursor: onTagClick ? 'pointer' : 'default' }}
            />
          ))}
        </Box>
      );
    }
    return String(value);
  };

  return (
    <Box sx={markdownStyles}>
      {frontmatter && (
        <Table size="small" sx={{ mb: 2, maxWidth: 400, bgcolor: 'grey.50', borderRadius: 1 }}>
          <TableBody>
            {Object.entries(frontmatter).map(([key, value]) => (
              <TableRow key={key}>
                <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary', width: 100, border: 'none', py: 0.5 }}>
                  {key}
                </TableCell>
                <TableCell sx={{ border: 'none', py: 0.5 }}>{renderValue(key, value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={isPublic ? transformUrl : undefined}
        components={components}
      >
        {body}
      </ReactMarkdown>
    </Box>
  );
}
