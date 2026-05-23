import { useMemo } from 'react';
import { Box, Alert, Slide, IconButton, Typography, Chip, Stack } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useWebSocketStore } from '../stores/websocketStore';

export default function NotificationBar() {
  const { notifications, removeNotification, isConnected } = useWebSocketStore();

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 70,
        right: 16,
        zIndex: 1400,
        width: 320,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Reconnecting to server...
        </Alert>
      )}
      {notifications.map((notification) => (
        <Slide key={notification.id} direction="left" in mountOnEnter unmountOnExit>
          <Alert
            severity={notification.type}
            action={
              <IconButton
                size="small"
                onClick={() => removeNotification(notification.id)}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            }
          >
            {notification.message}
          </Alert>
        </Slide>
      ))}
    </Box>
  );
}

interface EditorIndicatorProps {
  notePath: string;
}

export function EditorIndicator({ notePath }: EditorIndicatorProps) {
  const allEditors = useWebSocketStore((state) => state.editors);
  const editors = useMemo(() => allEditors[notePath] || [], [allEditors, notePath]);

  if (editors.length === 0) return null;

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary">
        Editing:
      </Typography>
      {editors.map((username) => (
        <Chip
          key={username}
          label={username}
          size="small"
          color="primary"
          variant="outlined"
        />
      ))}
    </Stack>
  );
}
