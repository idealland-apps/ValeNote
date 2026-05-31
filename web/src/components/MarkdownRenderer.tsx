import { useMemo, useState, useEffect } from 'react';
import { Box, Table, TableBody, TableRow, TableCell, Chip, CircularProgress, IconButton, Tooltip, Typography, useTheme } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
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
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  '& h1': { fontSize: '2em', fontWeight: 'bold', mt: 2, mb: 1, borderBottom: '1px solid', borderColor: 'divider', pb: 1 },
  '& h2': { fontSize: '1.5em', fontWeight: 'bold', mt: 2, mb: 1, borderBottom: '1px solid', borderColor: 'divider', pb: 0.5 },
  '& h3': { fontSize: '1.25em', fontWeight: 'bold', mt: 2, mb: 1 },
  '& p': { mb: 1.5, lineHeight: 1.7 },
  '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontFamily: 'monospace', fontSize: '0.9em' },
  '& pre': { bgcolor: 'action.hover', p: 2, borderRadius: 1, overflow: 'auto', position: 'relative', '& code': { bgcolor: 'transparent', p: 0 } },
  '& blockquote': { borderLeft: '3px solid', borderColor: 'divider', pl: 2, ml: 0, color: 'text.secondary' },
  '& ul, & ol': { pl: 3, mb: 1.5 },
  '& li': { mb: 0.5 },
  '& table': { borderCollapse: 'collapse', width: '100%', mb: 2 },
  '& th, & td': { border: '1px solid', borderColor: 'divider', p: 1 },
  '& img': { maxWidth: '100%' },
  '& a': { color: 'primary.main' },
};

function CodeBlock({ children, language, isDark }: { children?: React.ReactNode; language?: string; isDark: boolean }) {
  const [copied, setCopied] = useState(false);

  const code = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ position: 'relative', my: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          bgcolor: 'action.selected',
          px: 1.5,
          py: 0.5,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
        }}
      >
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
          {language || 'text'}
        </Typography>
        <Tooltip title={copied ? 'Copied' : 'Copy code'}>
          <IconButton size="small" onClick={handleCopy} sx={{ p: 0.5 }}>
            {copied ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
      </Box>
      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
        }}
      >
        {code}
      </SyntaxHighlighter>
    </Box>
  );
}

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

let headingCounter = 0;

export default function MarkdownRenderer({ content, onTagClick, notePath, isPublic, notebook }: Props) {
  const { frontmatter, body } = useMemo(() => parseFrontmatter(content), [content]);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

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

    const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

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
        return `${apiBase}/public/${encodeURIComponent(notebook)}/attachment/${encodePath(pathWithoutNotebook)}`;
      }
      return `${apiBase}/attachments/${encodePath(cleanPath)}`;
    };
  }, [resolveUrl, isPublic, notebook]);

  headingCounter = 0;

  const components = useMemo(() => {
    const createHeading = (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => {
      return ({ children }: { children?: React.ReactNode }) => {
        const index = headingCounter++;
        return <Tag data-heading-index={index}>{children}</Tag>;
      };
    };

    return {
      code: ({ children, className, ...props }: { children?: React.ReactNode; className?: string }) => {
        const match = /language-(\w+)/.exec(className || '');
        const isInline = !match && !String(children).includes('\n');
        if (isInline) {
          return <code className={className} {...props}>{children}</code>;
        }
        return <CodeBlock language={match?.[1]} isDark={isDark}>{children}</CodeBlock>;
      },
      pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      h1: createHeading('h1'),
      h2: createHeading('h2'),
      h3: createHeading('h3'),
      h4: createHeading('h4'),
      h5: createHeading('h5'),
      h6: createHeading('h6'),
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        const resolvedSrc = src ? transformUrl(src) : undefined;
        return isPublic ? <img src={resolvedSrc} alt={alt} /> : <AuthenticatedImage src={resolvedSrc} alt={alt} />;
      },
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        const resolvedHref = href ? transformUrl(href) : undefined;
        return isPublic ? <PublicLink href={resolvedHref}>{children}</PublicLink> : <AuthenticatedLink href={resolvedHref}>{children}</AuthenticatedLink>;
      },
    };
  }, [isDark, isPublic, transformUrl]);

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
        <Table size="small" sx={{ mb: 2, maxWidth: 400, bgcolor: 'action.hover', borderRadius: 1 }}>
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
