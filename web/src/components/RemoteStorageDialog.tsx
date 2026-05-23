import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Select, MenuItem, FormControl, InputLabel, Box, Alert, List, ListItem, ListItemText, ListItemSecondaryAction, IconButton, Switch, FormControlLabel, CircularProgress, Typography, Chip } from '@mui/material';
import { Delete as DeleteIcon, Sync as SyncIcon, Check as CheckIcon, Error as ErrorIcon } from '@mui/icons-material';
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
  s3_prefix?: string;
  webdav_url?: string;
  webdav_username?: string;
  webdav_path?: string;
  sync_interval_minutes: number;
  delete_remote: boolean;
  last_sync_at?: string;
  last_sync_status?: string;
  last_sync_error?: string;
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
      alert('Connection successful!');
    } catch {
      alert('Connection failed!');
    } finally {
      setTesting(null);
    }
  };

  const handleSync = async (id: number) => {
    setSyncing(id);
    try {
      await api.post(`/settings/remote-storage/${id}/sync`);
      alert('Sync started!');
    } catch {
      alert('Sync failed to start');
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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Remote Storage Sync</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {editing ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              fullWidth
            />
            <FormControl fullWidth>
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
                />
                <TextField
                  label="Region"
                  value={editing.s3_region || ''}
                  onChange={(e) => setEditing({ ...editing, s3_region: e.target.value })}
                  placeholder="us-east-1"
                  fullWidth
                />
                <TextField
                  label="Bucket"
                  value={editing.s3_bucket || ''}
                  onChange={(e) => setEditing({ ...editing, s3_bucket: e.target.value })}
                  fullWidth
                />
                <TextField
                  label="Access Key"
                  value={editing.s3_access_key || ''}
                  onChange={(e) => setEditing({ ...editing, s3_access_key: e.target.value })}
                  fullWidth
                />
                <TextField
                  label="Secret Key"
                  type="password"
                  onChange={(e) => setEditing({ ...editing, s3_secret_key: e.target.value } as RemoteStorage)}
                  fullWidth
                />
                <TextField
                  label="Prefix (optional)"
                  value={editing.s3_prefix || ''}
                  onChange={(e) => setEditing({ ...editing, s3_prefix: e.target.value })}
                  placeholder="valenote/"
                  fullWidth
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
                />
                <TextField
                  label="Username"
                  value={editing.webdav_username || ''}
                  onChange={(e) => setEditing({ ...editing, webdav_username: e.target.value })}
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  onChange={(e) => setEditing({ ...editing, webdav_password: e.target.value } as RemoteStorage)}
                  fullWidth
                />
                <TextField
                  label="Path"
                  value={editing.webdav_path || ''}
                  onChange={(e) => setEditing({ ...editing, webdav_path: e.target.value })}
                  placeholder="/valenote"
                  fullWidth
                />
              </>
            )}

            <TextField
              label="Sync Interval (minutes)"
              type="number"
              value={editing.sync_interval_minutes}
              onChange={(e) => setEditing({ ...editing, sync_interval_minutes: parseInt(e.target.value) || 60 })}
              fullWidth
            />

            <FormControlLabel
              control={
                <Switch
                  checked={editing.delete_remote}
                  onChange={(e) => setEditing({ ...editing, delete_remote: e.target.checked })}
                />
              }
              label="Delete remote files when deleted locally"
            />

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="contained" onClick={handleSave}>Save</Button>
            </Box>
          </Box>
        ) : (
          <>
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
                      <IconButton onClick={() => handleTest(storage.id)} disabled={testing === storage.id}>
                        {testing === storage.id ? <CircularProgress size={20} /> : <CheckIcon />}
                      </IconButton>
                      <IconButton onClick={() => handleSync(storage.id)} disabled={syncing === storage.id}>
                        {syncing === storage.id ? <CircularProgress size={20} /> : <SyncIcon />}
                      </IconButton>
                      <IconButton onClick={() => setEditing(storage)}>
                        <Typography variant="body2">Edit</Typography>
                      </IconButton>
                      <IconButton onClick={() => handleDelete(storage.id)} color="error">
                        <DeleteIcon />
                      </IconButton>
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
            <Button onClick={() => setEditing(newStorage())}>Add Storage</Button>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
