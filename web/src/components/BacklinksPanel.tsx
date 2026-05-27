import { useState, useEffect } from 'react';
import { Box, Typography, List, ListItemButton, ListItemText, Collapse, IconButton, Divider, CircularProgress } from '@mui/material';
import { ExpandMore as ExpandIcon, Link as LinkIcon } from '@mui/icons-material';
import api from '../services/api';

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

interface Backlink {
  path: string;
  title: string;
  context?: string;
}

interface Props {
  notePath: string;
  onNavigate: (path: string) => void;
}

export default function BacklinksPanel({ notePath, onNavigate }: Props) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!notePath) return;

    setLoading(true);
    api.get<Backlink[]>(`/backlinks/${encodePath(notePath)}`)
      .then(({ data }) => setBacklinks(data || []))
      .catch(() => setBacklinks([]))
      .finally(() => setLoading(false));
  }, [notePath]);

  if (backlinks.length === 0 && !loading) {
    return null;
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Divider />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          p: 1,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <LinkIcon sx={{ mr: 1, fontSize: 18 }} />
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          Backlinks ({backlinks.length})
        </Typography>
        <IconButton size="small">
          <ExpandIcon
            sx={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          <List dense>
            {backlinks.map((backlink) => (
              <ListItemButton
                key={backlink.path}
                onClick={() => onNavigate(backlink.path)}
                sx={{ py: 0.5 }}
              >
                <ListItemText
                  primary={backlink.title || backlink.path}
                  secondary={backlink.context}
                  slotProps={{
                    secondary: {
                      noWrap: true,
                      sx: { fontSize: '0.75rem' },
                    },
                  }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Collapse>
    </Box>
  );
}
