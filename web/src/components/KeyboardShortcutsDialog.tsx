import { Dialog, DialogTitle, DialogContent, List, ListItem, ListItemText, Typography, Box, Chip } from '@mui/material';
import { getShortcuts, formatShortcut } from '../hooks/useKeyboardShortcuts';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsDialog({ open, onClose }: Props) {
  const shortcuts = getShortcuts();

  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.description.split(':')[0] || 'General';
    if (!acc[category]) acc[category] = [];
    acc[category].push(shortcut);
    return acc;
  }, {} as Record<string, typeof shortcuts>);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Keyboard Shortcuts</DialogTitle>
      <DialogContent>
        {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
          <Box key={category} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              {category}
            </Typography>
            <List dense>
              {categoryShortcuts.map((shortcut, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={shortcut.description.split(':').slice(1).join(':').trim() || shortcut.description}
                  />
                  <Chip
                    label={formatShortcut(shortcut)}
                    size="small"
                    variant="outlined"
                    sx={{ fontFamily: 'monospace' }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        ))}
        {shortcuts.length === 0 && (
          <Typography color="text.secondary">
            No keyboard shortcuts registered
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}
