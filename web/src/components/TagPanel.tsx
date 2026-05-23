import { useState, useEffect } from 'react';
import {
  Box,
  Chip,
  Typography,
  Paper,
  CircularProgress,
  TextField,
  InputAdornment,
} from '@mui/material';
import { Search as SearchIcon, LocalOffer as TagIcon } from '@mui/icons-material';
import { tagApi, type TagInfo } from '../services/api';
import { useNoteStore } from '../stores/noteStore';

interface Props {
  onTagClick?: (tag: string) => void;
}

export default function TagPanel({ onTagClick }: Props) {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const { searchNotes } = useNoteStore();

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    setLoading(true);
    try {
      const res = await tagApi.list();
      const sorted = res.data.sort((a, b) => b.count - a.count);
      setTags(sorted);
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
      onTagClick?.('');
    } else {
      setSelectedTag(tag);
      onTagClick?.(tag);
      searchNotes('', undefined, [tag]);
    }
  };

  const filteredTags = tags.filter((t) =>
    t.name.toLowerCase().includes(filter.toLowerCase())
  );

  const maxCount = Math.max(...tags.map((t) => t.count), 1);
  const getChipSize = (count: number): 'small' | 'medium' => {
    return count / maxCount > 0.5 ? 'medium' : 'small';
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Paper sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <TagIcon color="primary" />
        <Typography variant="h6">Tags</Typography>
        <Typography variant="caption" color="text.secondary">
          ({tags.length})
        </Typography>
      </Box>

      <TextField
        size="small"
        fullWidth
        placeholder="Filter tags..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 2 }}
      />

      {filteredTags.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          {tags.length === 0 ? 'No tags yet' : 'No matching tags'}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {filteredTags.map((tag) => (
            <Chip
              key={tag.name}
              label={`${tag.name} (${tag.count})`}
              size={getChipSize(tag.count)}
              color={selectedTag === tag.name ? 'primary' : 'default'}
              variant={selectedTag === tag.name ? 'filled' : 'outlined'}
              onClick={() => handleTagClick(tag.name)}
              sx={{
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            />
          ))}
        </Box>
      )}

      {selectedTag && (
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            Showing notes with tag: <strong>{selectedTag}</strong>
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
