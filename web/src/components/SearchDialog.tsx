import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  TextField,
  Tabs,
  Tab,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  Box,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import { Search as SearchIcon, Description as FileIcon, TextSnippet as ContentIcon } from '@mui/icons-material';
import { noteApi, type SearchResult, type FileItem } from '../services/api';

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  fileItems: FileItem[];
}

export default function SearchDialog({ open, onClose, onSelect, fileItems }: SearchDialogProps) {
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [fulltextResults, setFulltextResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setQuery('');
      setFulltextResults([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const searchFulltext = useCallback(async (q: string) => {
    if (!q.trim()) {
      setFulltextResults([]);
      return;
    }

    setLoading(true);
    try {
      const res = await noteApi.searchFulltext(q.trim());
      setFulltextResults(res.data || []);
    } catch {
      setFulltextResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 0 && query) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        searchFulltext(query);
      }, 300);
    }
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, tab, searchFulltext]);

  const filteredFiles = query && fileItems
    ? fileItems.filter(item =>
        item.type === 'file' &&
        item.name.endsWith('.md') &&
        !item.path.includes('/attachments/') &&
        !item.path.startsWith('attachments/') &&
        (item.name.toLowerCase().includes(query.toLowerCase()) ||
         item.path.toLowerCase().includes(query.toLowerCase()))
      )
    : [];

  const handleSelect = (path: string) => {
    if (path.endsWith('.md')) {
      onSelect(path);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: { minHeight: 400, maxHeight: '80vh' }
        }
      }}
    >
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2, pb: 0 }}>
          <TextField
            inputRef={inputRef}
            fullWidth
            placeholder={tab === 0 ? 'Search note content...' : 'Search files and folders...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: loading ? (
                  <InputAdornment position="end">
                    <CircularProgress size={20} />
                  </InputAdornment>
                ) : null,
              },
            }}
          />
        </Box>

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab icon={<ContentIcon />} iconPosition="start" label="Full-text" />
          <Tab icon={<FileIcon />} iconPosition="start" label="File" />
        </Tabs>

        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          {tab === 0 ? (
            query ? (
              fulltextResults.length > 0 ? (
                <List dense>
                  {fulltextResults.map((result) => (
                    <ListItemButton
                      key={result.path}
                      onClick={() => handleSelect(result.path)}
                    >
                      <ListItemText
                        primary={result.title || result.path.split('/').pop()}
                        secondary={
                          <>
                            <Typography variant="caption" color="text.secondary" component="span">
                              {result.path}
                            </Typography>
                            {result.snippet && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                component="span"
                                sx={{
                                  display: 'block',
                                  mt: 0.5,
                                  fontSize: '0.75rem',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {result.snippet}
                              </Typography>
                            )}
                          </>
                        }
                      />
                    </ListItemButton>
                  ))}
                </List>
              ) : !loading ? (
                <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                  <Typography>No results found</Typography>
                </Box>
              ) : null
            ) : (
              <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                <Typography>Type to search note content</Typography>
              </Box>
            )
          ) : (
            query ? (
              filteredFiles.length > 0 ? (
                <List dense>
                  {filteredFiles.map((item) => (
                    <ListItemButton
                      key={item.path}
                      onClick={() => handleSelect(item.path)}
                    >
                      <ListItemText
                        primary={item.name}
                        secondary={item.path}
                      />
                    </ListItemButton>
                  ))}
                </List>
              ) : (
                <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                  <Typography>No files found</Typography>
                </Box>
              )
            ) : (
              <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                <Typography>Type to search files and folders</Typography>
              </Box>
            )
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
