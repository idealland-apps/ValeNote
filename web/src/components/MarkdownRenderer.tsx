import { useMemo } from 'react';
import { Box, Table, TableBody, TableRow, TableCell, Chip } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  onTagClick?: (tag: string) => void;
}

interface Frontmatter {
  tags?: string[];
  [key: string]: string | string[] | undefined;
}

function parseTags(value: string): string[] {
  const trimmed = value.trim();
  // Format: [tag1, tag2]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map(t => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  // Format: tag1, tag2, tag3
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map(t => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  // Single tag
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

export default function MarkdownRenderer({ content, onTagClick }: Props) {
  const { frontmatter, body } = useMemo(() => parseFrontmatter(content), [content]);

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
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </Box>
  );
}
