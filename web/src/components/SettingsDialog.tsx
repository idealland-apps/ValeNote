import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, Tabs, Tab, Box, List, ListItem, ListItemText,
  ListItemSecondaryAction, Select, MenuItem, Slider, Typography, Divider,
  TextField, Button, Alert, CircularProgress, Switch
} from '@mui/material';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import AgentManagement from './AgentManagement';
import UserManagement from './UserManagement';
import RemoteStorageDialog from './RemoteStorageDialog';
import { useSiteStore } from '../stores/siteStore';
import api from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  notebooks: Array<{ id: number; name: string }>;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div hidden={value !== index} style={{ height: '100%' }}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

interface SystemSettings {
  version_retention_days: number;
  version_max_count: number;
  site_name: string;
  show_powered_by: boolean;
}

export default function SettingsDialog({ open, onClose, notebooks }: Props) {
  const { themeMode, editorFontSize, setThemeMode, setEditorFontSize } = useSettingsStore();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.is_admin ?? false;
  const [tabIndex, setTabIndex] = useState(0);
  const [publicPath, setPublicPath] = useState('/public');
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    version_retention_days: 30,
    version_max_count: 100,
    site_name: 'ValeNote',
    show_powered_by: true,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [remoteStorageOpen, setRemoteStorageOpen] = useState(false);
  const [reservedPaths, setReservedPaths] = useState<string[]>([]);
  const [appVersion, setAppVersion] = useState('loading...');

  useEffect(() => {
    if (open) {
      loadSettings();
      api.get<{ version: string }>('/version').then(res => {
        setAppVersion(res.data.version);
      }).catch(() => {
        setAppVersion('unknown');
      });
    }
  }, [open]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [pathRes, sysRes] = await Promise.all([
        api.get<{ path: string; reserved_paths: string[] }>('/settings/public-path'),
        api.get<SystemSettings>('/settings/system'),
      ]);
      setPublicPath(pathRes.data.path);
      setReservedPaths(pathRes.data.reserved_paths || []);
      setSystemSettings({
        version_retention_days: sysRes.data.version_retention_days ?? 30,
        version_max_count: sysRes.data.version_max_count ?? 100,
        site_name: sysRes.data.site_name || 'ValeNote',
        show_powered_by: sysRes.data.show_powered_by ?? true,
      });
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePublicPath = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put('/settings/public-path', { path: publicPath });
      setSuccess('Public path updated');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Invalid path. Use lowercase letters, numbers, and hyphens only.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSystemSettings = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put('/settings/system', systemSettings);
      useSiteStore.setState({
        siteName: systemSettings.site_name,
        showPoweredBy: systemSettings.show_powered_by,
        loaded: true,
      });
      setSuccess('Settings saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>Settings</DialogTitle>
        <DialogContent sx={{ minHeight: 500 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

          <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="Appearance" />
            {isAdmin && <Tab label="Site" />}
            <Tab label="Agents" />
            {isAdmin && <Tab label="Users" />}
            <Tab label="Public Access" />
            <Tab label="Backup" />
            <Tab label="About" />
          </Tabs>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TabPanel value={tabIndex} index={0}>
                <List>
                  <ListItem>
                    <ListItemText
                      primary="Theme"
                      secondary="Choose your preferred color scheme"
                    />
                    <ListItemSecondaryAction>
                      <Select
                        value={themeMode}
                        onChange={(e) => setThemeMode(e.target.value as 'light' | 'dark' | 'system')}
                        size="small"
                      >
                        <MenuItem value="light">Light</MenuItem>
                        <MenuItem value="dark">Dark</MenuItem>
                        <MenuItem value="system">System</MenuItem>
                      </Select>
                    </ListItemSecondaryAction>
                  </ListItem>

                  <Divider />

                  <ListItem>
                    <Box sx={{ width: '100%' }}>
                      <Typography gutterBottom>
                        Editor Font Size: {editorFontSize}px
                      </Typography>
                      <Slider
                        value={editorFontSize}
                        onChange={(_, value) => setEditorFontSize(value as number)}
                        min={12}
                        max={24}
                        step={1}
                        marks={[
                          { value: 12, label: '12' },
                          { value: 16, label: '16' },
                          { value: 20, label: '20' },
                          { value: 24, label: '24' },
                        ]}
                      />
                    </Box>
                  </ListItem>
                </List>
              </TabPanel>

              {isAdmin && (
                <TabPanel value={tabIndex} index={1}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Configure the site name that appears in the page title, sidebar, and public pages.
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mb: 3 }}>
                    <TextField
                      label="Site Name"
                      value={systemSettings.site_name}
                      onChange={(e) => setSystemSettings({
                        ...systemSettings,
                        site_name: e.target.value,
                      })}
                      placeholder="ValeNote"
                      helperText="This name will be displayed in the browser title, sidebar header, and public pages"
                      sx={{ flexGrow: 1, maxWidth: 400 }}
                    />
                    <Button
                      variant="contained"
                      onClick={handleSaveSystemSettings}
                      disabled={saving}
                      sx={{ mt: 1 }}
                    >
                      Save
                    </Button>
                  </Box>
                </TabPanel>
              )}

              <TabPanel value={tabIndex} index={isAdmin ? 2 : 1}>
                <AgentManagement notebooks={notebooks} />
              </TabPanel>

              {isAdmin && (
                <TabPanel value={tabIndex} index={3}>
                  <UserManagement />
                </TabPanel>
              )}

              <TabPanel value={tabIndex} index={isAdmin ? 4 : 2}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Configure the base URL path for publicly accessible notebooks.
                  Public notebooks can be accessed at: <code>{window.location.origin}{publicPath}/[notebook-name]/</code>
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mb: 3 }}>
                  <TextField
                    label="Public Base Path"
                    value={publicPath}
                    onChange={(e) => setPublicPath(e.target.value)}
                    placeholder="/public"
                    helperText="e.g., /public, /blog, /wiki (lowercase letters, numbers, hyphens only)"
                    sx={{ flexGrow: 1 }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleSavePublicPath}
                    disabled={saving}
                    sx={{ mt: 1 }}
                  >
                    Save
                  </Button>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Reserved Paths (cannot be used):
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {reservedPaths.length > 0 ? reservedPaths.map(p => `/${p}`).sort().join(', ') : 'Loading...'}
                </Typography>

                <Divider sx={{ my: 2 }} />

                <Typography variant="body2" color="text.secondary">
                  To make a notebook public, click the settings icon next to the notebook name in the sidebar
                  and enable "Public Access".
                </Typography>

                <Divider sx={{ my: 2 }} />

                <List disablePadding>
                  <ListItem>
                    <ListItemText
                      primary="Show 'Powered by ValeNote'"
                      secondary="Display a credit link on public pages"
                    />
                    <ListItemSecondaryAction>
                      <Switch
                        checked={systemSettings.show_powered_by}
                        onChange={(e) => setSystemSettings({
                          ...systemSettings,
                          show_powered_by: e.target.checked,
                        })}
                      />
                    </ListItemSecondaryAction>
                  </ListItem>
                </List>
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    onClick={handleSaveSystemSettings}
                    disabled={saving}
                  >
                    Save
                  </Button>
                </Box>
              </TabPanel>

              <TabPanel value={tabIndex} index={isAdmin ? 5 : 3}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Version History
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Configure how long version history is retained for your notes.
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                  <TextField
                    label="Retention Days"
                    type="number"
                    size="small"
                    value={systemSettings.version_retention_days}
                    onChange={(e) => setSystemSettings({
                      ...systemSettings,
                      version_retention_days: parseInt(e.target.value) || 30,
                    })}
                    helperText="Keep versions for this many days"
                    slotProps={{ htmlInput: { min: 1 } }}
                    sx={{ maxWidth: 200 }}
                  />

                  <TextField
                    label="Maximum Versions"
                    type="number"
                    size="small"
                    value={systemSettings.version_max_count}
                    onChange={(e) => setSystemSettings({
                      ...systemSettings,
                      version_max_count: parseInt(e.target.value) || 100,
                    })}
                    helperText="Max versions per note"
                    slotProps={{ htmlInput: { min: 1 } }}
                    sx={{ maxWidth: 200 }}
                  />

                  <Button
                    variant="contained"
                    onClick={handleSaveSystemSettings}
                    disabled={saving}
                    sx={{ alignSelf: 'flex-start', mt: 0.5 }}
                  >
                    Save
                  </Button>
                </Box>

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Remote Storage
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Configure automatic backup to remote storage (S3, WebDAV, etc.)
                </Typography>

                <Button
                  variant="outlined"
                  onClick={() => setRemoteStorageOpen(true)}
                >
                  Manage Remote Storage
                </Button>

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Manual Export
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Download all your notes as a ZIP file
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => window.open('/api/v1/export', '_blank')}
                >
                  Export All Notes
                </Button>
              </TabPanel>

              <TabPanel value={tabIndex} index={isAdmin ? 6 : 4}>
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="h4" sx={{ mb: 2, fontWeight: 'bold' }}>
                    ValeNote
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    A modern note-taking application
                  </Typography>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Version: {appVersion}
                  </Typography>
                  <Divider sx={{ my: 3 }} />
                  <Typography variant="body2" color="text.secondary">
                    Built with Go, React, and Material-UI
                  </Typography>
                </Box>
              </TabPanel>
            </>
          )}
        </DialogContent>
      </Dialog>

      <RemoteStorageDialog
        open={remoteStorageOpen}
        onClose={() => setRemoteStorageOpen(false)}
      />
    </>
  );
}
