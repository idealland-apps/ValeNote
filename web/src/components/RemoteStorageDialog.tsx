import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Select, MenuItem, FormControl, InputLabel, Box, Alert, List, ListItem, ListItemText, ListItemSecondaryAction, IconButton, Switch, FormControlLabel, CircularProgress, Typography, Chip, Tooltip } from '@mui/material';
import { Delete as DeleteIcon, Sync as SyncIcon, Check as CheckIcon, Error as ErrorIcon, Edit as EditIcon, NetworkCheck as TestIcon, History as HistoryIcon } from '@mui/icons-material';
import api from '../services/api';

interface RemoteStorage {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  s3_endpoint?: string;
  s3_region?: string;
  s3_bucket?: string;
  s3_access_key?: string;
  s3_secret_key?: string;
  s3_prefix?: string;
  webdav_url?: string;
  webdav_username?: string;
  webdav_password?: string;
  webdav_path?: string;
  sync_interval_minutes: number;
  delete_remote: boolean;
  last_sync_at?: string;
  last_sync_status?: string;
  last_sync_error?: string;
}

interface SyncHistory {
  id: number;
  storage_id: number;
  status: string;
  error?: string;
  files_uploaded: number;
  files_deleted: number;
  started_at: string;
  finished_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function RemoteStorageDialog({ open, onClose }: Props) {
  const [storages, setStorages] = useState<RemoteStorage[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<RemoteStorage | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; storageName: string; history: SyncHistory[] }>({
    open: false,
    storageName: '',
    history: [],
  });

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleShowHistory = async (storage: RemoteStorage) => {
    try {
      const { data } = await api.get<SyncHistory[]>(`/settings/remote-storage/${storage.id}/history`);
      setHistoryDialog({ open: true, storageName: storage.name, history: data || [] });
    } catch {
      showMessage('Failed to load sync history', 'error');
    }
  };

  useEffect(() => {
    if (open) {
      loadStorages();
    }
  }, [open]);

  const loadStorages = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<RemoteStorage[]>('/settings/remote-storage');
      setStorages(data || []);
    } catch {
      setError('Failed to load storages');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      if (editing.id) {
        await api.put(`/settings/remote-storage/${editing.id}`, editing);
      } else {
        await api.post('/settings/remote-storage', editing);
      }
      setEditing(null);
      loadStorages();
    } catch {
      setError('Failed to save storage');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      await api.delete(`/settings/remote-storage/${id}`);
      loadStorages();
    } catch {
      setError('Failed to delete storage');
    }
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    try {
      await api.post(`/settings/remote-storage/${id}/test`);
      showMessage('Connection successful!', 'success');
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Connection failed';
      showMessage(`Connection failed: ${message}`, 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleSync = async (id: number) => {
    setSyncing(id);
    try {
      await api.post(`/settings/remote-storage/${id}/sync`);
      showMessage('Sync started!', 'success');
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Sync failed to start';
      showMessage(message, 'error');
    } finally {
      setSyncing(null);
    }
  };

  const newStorage = (): RemoteStorage => ({
    id: 0,
    name: '',
    type: 's3',
    enabled: true,
    sync_interval_minutes: 60,
    delete_remote: false,
  });

  return (
    <>
      {/* Storage List Dialog */}
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Remote Storage Sync</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <List>
              {storages.map((storage) => (
                <ListItem key={storage.id}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {storage.name}
                        <Chip label={storage.type.toUpperCase()} size="small" />
                        {storage.enabled ? (
                          <Chip label="Auto" size="small" color="primary" variant="outlined" />
                        ) : (
                          <Chip label="Manual" size="small" variant="outlined" />
                        )}
                        {storage.last_sync_status === 'success' && <CheckIcon color="success" fontSize="small" />}
                        {storage.last_sync_status === 'failed' && <ErrorIcon color="error" fontSize="small" />}
                      </Box>
                    }
                    secondary={
                      storage.last_sync_at
                        ? `Last synced: ${new Date(storage.last_sync_at).toLocaleString()}`
                        : 'Never synced'
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="Test Connection">
                      <IconButton onClick={() => handleTest(storage.id)} disabled={testing === storage.id}>
                        {testing === storage.id ? <CircularProgress size={20} /> : <TestIcon />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Sync Now">
                      <IconButton onClick={() => handleSync(storage.id)} disabled={syncing === storage.id}>
                        {syncing === storage.id ? <CircularProgress size={20} /> : <SyncIcon />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Sync History">
                      <IconButton onClick={() => handleShowHistory(storage)}>
                        <HistoryIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton onClick={() => setEditing(storage)}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton onClick={() => handleDelete(storage.id)} color="error">
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
              {storages.length === 0 && (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  No remote storage configured
                </Typography>
              )}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(newStorage())}>Add Storage</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Edit/Add Storage Dialog */}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing?.id ? 'Edit Storage' : 'Add Storage'}</DialogTitle>
        <DialogContent>
          {editing && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                fullWidth
                size="small"
              />
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select
                  value={editing.type}
                  onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                  label="Type"
                >
                  <MenuItem value="s3">S3 / S3-Compatible</MenuItem>
                  <MenuItem value="webdav">WebDAV</MenuItem>
                </Select>
              </FormControl>

              {editing.type === 's3' && (
                <>
                  <TextField
                    label="Endpoint (optional for AWS)"
                    value={editing.s3_endpoint || ''}
                    onChange={(e) => setEditing({ ...editing, s3_endpoint: e.target.value })}
                    placeholder="https://s3.amazonaws.com"
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Region"
                    value={editing.s3_region || ''}
                    onChange={(e) => setEditing({ ...editing, s3_region: e.target.value })}
                    placeholder="us-east-1"
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Bucket"
                    value={editing.s3_bucket || ''}
                    onChange={(e) => setEditing({ ...editing, s3_bucket: e.target.value })}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Access Key"
                    value={editing.s3_access_key || ''}
                    onChange={(e) => setEditing({ ...editing, s3_access_key: e.target.value })}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Secret Key"
                    type="password"
                    onChange={(e) => setEditing({ ...editing, s3_secret_key: e.target.value })}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Prefix (optional)"
                    value={editing.s3_prefix || ''}
                    onChange={(e) => setEditing({ ...editing, s3_prefix: e.target.value })}
                    placeholder="valenote/"
                    fullWidth
                    size="small"
                  />
                </>
              )}

              {editing.type === 'webdav' && (
                <>
                  <TextField
                    label="WebDAV URL"
                    value={editing.webdav_url || ''}
                    onChange={(e) => setEditing({ ...editing, webdav_url: e.target.value })}
                    placeholder="https://example.com/webdav"
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Username"
                    value={editing.webdav_username || ''}
                    onChange={(e) => setEditing({ ...editing, webdav_username: e.target.value })}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Password"
                    type="password"
                    onChange={(e) => setEditing({ ...editing, webdav_password: e.target.value })}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Path"
                    value={editing.webdav_path || ''}
                    onChange={(e) => setEditing({ ...editing, webdav_path: e.target.value })}
                    placeholder="/valenote"
                    fullWidth
                    size="small"
                  />
                </>
              )}

              <TextField
                label="Sync Interval (minutes)"
                type="number"
                value={editing.sync_interval_minutes}
                onChange={(e) => setEditing({ ...editing, sync_interval_minutes: parseInt(e.target.value) || 60 })}
                fullWidth
                size="small"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={editing.enabled}
                    onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                    size="small"
                  />
                }
                label="Enable automatic sync"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={editing.delete_remote}
                    onChange={(e) => setEditing({ ...editing, delete_remote: e.target.checked })}
                    size="small"
                  />
                }
                label="Delete remote files when deleted locally"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Message Dialog */}
      <Dialog open={snackbar.open} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <DialogContent>
          <Alert severity={snackbar.severity} sx={{ minWidth: 300 }}>
            {snackbar.message}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSnackbar({ ...snackbar, open: false })}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialog.open} onClose={() => setHistoryDialog({ ...historyDialog, open: false })} maxWidth="xs" fullWidth>
        <DialogTitle>Sync History - {historyDialog.storageName}</DialogTitle>
        <DialogContent sx={{ maxHeight: 400 }}>
          {historyDialog.history.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }}>No sync history</Typography>
          ) : (
            <List dense>
              {historyDialog.history.map((h) => (
                <ListItem key={h.id} sx={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    {h.status === 'success' ? (
                      <CheckIcon color="success" fontSize="small" />
                    ) : (
                      <ErrorIcon color="error" fontSize="small" />
                    )}
                    <Typography variant="body2">
                      {new Date(h.started_at).toLocaleString()}
                    </Typography>
                    <Chip
                      label={h.status}
                      size="small"
                      color={h.status === 'success' ? 'success' : 'error'}
                      variant="outlined"
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                    Uploaded: {h.files_uploaded}, Deleted: {h.files_deleted}
                    {h.error && ` | Error: ${h.error}`}
                  </Typography>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, ml: 1 }}>
            Showing up to 20 recent records
          </Typography>
          <Button onClick={() => setHistoryDialog({ ...historyDialog, open: false })}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
