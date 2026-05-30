import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, Tabs, Tab, Box, List, ListItem, ListItemText,
  ListItemSecondaryAction, Select, MenuItem, Slider, Typography, Divider,
  TextField, Button, Alert, CircularProgress, Switch, Tooltip, Popover
} from '@mui/material';
import { Colorize as ColorizeIcon } from '@mui/icons-material';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { useSettingsStore, THEME_COLOR_OPTIONS } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import AgentManagement from './AgentManagement';
import UserManagement from './UserManagement';
import RemoteStorageDialog from './RemoteStorageDialog';
import { useSiteStore } from '../stores/siteStore';
import { setTimezone } from '../utils/time';
import api, { settingsApi } from '../services/api';

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
  timezone: string;
}

export default function SettingsDialog({ open, onClose, notebooks }: Props) {
  const { themeMode, primaryColor, editorFontSize, smartPasteLink, setThemeMode, setPrimaryColor, setEditorFontSize, setSmartPasteLink } = useSettingsStore();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.is_admin ?? false;
  const [tabIndex, setTabIndex] = useState(0);
  const [publicPath, setPublicPath] = useState('/public');
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    version_retention_days: 30,
    version_max_count: 100,
    site_name: 'ValeNote',
    show_powered_by: true,
    timezone: 'UTC',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [remoteStorageOpen, setRemoteStorageOpen] = useState(false);
  const [reservedPaths, setReservedPaths] = useState<string[]>([]);
  const [appVersion, setAppVersion] = useState('loading...');
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [faviconKey, setFaviconKey] = useState(Date.now());
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<HTMLElement | null>(null);
  const [tempColor, setTempColor] = useState(primaryColor);

  const showAutoSaveSuccess = useCallback(() => {
    setSuccess('Saved');
    setTimeout(() => setSuccess(''), 2000);
  }, []);

  const handleThemeChange = useCallback((mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode);
    showAutoSaveSuccess();
  }, [setThemeMode, showAutoSaveSuccess]);

  const handlePrimaryColorChange = useCallback((color: string) => {
    setPrimaryColor(color);
    showAutoSaveSuccess();
  }, [setPrimaryColor, showAutoSaveSuccess]);

  const handleColorPickerOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setTempColor(primaryColor);
    setColorPickerAnchor(event.currentTarget);
  }, [primaryColor]);

  const handleColorPickerClose = useCallback(() => {
    setColorPickerAnchor(null);
  }, []);

  const handleColorPickerConfirm = useCallback(() => {
    handlePrimaryColorChange(tempColor);
    setColorPickerAnchor(null);
  }, [tempColor, handlePrimaryColorChange]);

  const handleFontSizeChange = useCallback((size: number) => {
    setEditorFontSize(size);
    showAutoSaveSuccess();
  }, [setEditorFontSize, showAutoSaveSuccess]);

  const handleSmartPasteLinkChange = useCallback((enabled: boolean) => {
    setSmartPasteLink(enabled);
    showAutoSaveSuccess();
  }, [setSmartPasteLink, showAutoSaveSuccess]);

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
        timezone: sysRes.data.timezone || 'UTC',
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
      useSiteStore.setState({ publicBasePath: publicPath });
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
      setTimezone(systemSettings.timezone);
      useSiteStore.setState({
        siteName: systemSettings.site_name,
        showPoweredBy: systemSettings.show_powered_by,
        timezone: systemSettings.timezone,
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

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('File too large (max 2MB)');
      return;
    }

    setFaviconUploading(true);
    setError('');
    try {
      await settingsApi.uploadFavicon(file);
      setFaviconKey(Date.now());
      setSuccess('Favicon updated');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to upload favicon');
    } finally {
      setFaviconUploading(false);
      if (faviconInputRef.current) {
        faviconInputRef.current.value = '';
      }
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
            <Tab label="Editor" />
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
                        onChange={(e) => handleThemeChange(e.target.value as 'light' | 'dark' | 'system')}
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
                    <ListItemText
                      primary="Primary Color"
                      secondary="Choose the accent color for the interface"
                    />
                    <ListItemSecondaryAction>
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        {THEME_COLOR_OPTIONS.map((option) => (
                          <Box
                            key={option.color}
                            onClick={() => handlePrimaryColorChange(option.color)}
                            title={option.name}
                            sx={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              bgcolor: option.color,
                              cursor: 'pointer',
                              border: primaryColor === option.color ? '2px solid' : '2px solid transparent',
                              borderColor: primaryColor === option.color ? 'text.primary' : 'transparent',
                              '&:hover': {
                                transform: 'scale(1.1)',
                              },
                              transition: 'transform 0.1s',
                            }}
                          />
                        ))}

                        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

                        <Tooltip title="Custom color">
                          <Box
                            onClick={handleColorPickerOpen}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              cursor: 'pointer',
                              '&:hover': { opacity: 0.8 },
                            }}
                          >
                            <ColorizeIcon sx={{ fontSize: 18, color: 'text.secondary', mr: 0.5 }} />
                            <Box
                              sx={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                bgcolor: primaryColor,
                                border: '1px solid',
                                borderColor: 'divider',
                              }}
                            />
                          </Box>
                        </Tooltip>
                        <Popover
                          open={Boolean(colorPickerAnchor)}
                          anchorEl={colorPickerAnchor}
                          onClose={handleColorPickerClose}
                          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
                        >
                          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                            <HexColorPicker color={tempColor} onChange={setTempColor} />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>#</Typography>
                              <HexColorInput
                                color={tempColor}
                                onChange={setTempColor}
                                style={{
                                  flex: 1,
                                  padding: '6px 8px',
                                  border: '1px solid #ccc',
                                  borderRadius: 4,
                                  fontSize: 14,
                                  textTransform: 'uppercase',
                                }}
                              />
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={handleColorPickerClose}
                                sx={{ flex: 1 }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                onClick={handleColorPickerConfirm}
                                sx={{ flex: 1 }}
                              >
                                Apply
                              </Button>
                            </Box>
                          </Box>
                        </Popover>
                      </Box>
                    </ListItemSecondaryAction>
                  </ListItem>
                </List>
              </TabPanel>

              <TabPanel value={tabIndex} index={1}>
                <List>
                  <ListItem>
                    <ListItemText
                      primary="Font Size"
                      secondary={`${editorFontSize}px`}
                    />
                    <ListItemSecondaryAction sx={{ width: 200 }}>
                      <Slider
                        value={editorFontSize}
                        onChange={(_, value) => handleFontSizeChange(value as number)}
                        min={12}
                        max={24}
                        step={1}
                        marks={[
                          { value: 12, label: '12' },
                          { value: 18, label: '18' },
                          { value: 24, label: '24' },
                        ]}
                      />
                    </ListItemSecondaryAction>
                  </ListItem>

                  <Divider />

                  <ListItem>
                    <ListItemText
                      primary="Smart Paste Link"
                      secondary="When pasting a URL with HTML format, automatically convert it to Markdown link with title"
                    />
                    <ListItemSecondaryAction>
                      <Switch
                        checked={smartPasteLink}
                        onChange={(e) => handleSmartPasteLinkChange(e.target.checked)}
                      />
                    </ListItemSecondaryAction>
                  </ListItem>
                </List>
              </TabPanel>

              {isAdmin && (
                <TabPanel value={tabIndex} index={2}>
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

                  <Divider sx={{ my: 3 }} />

                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Timezone
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Set the timezone for displaying dates and times throughout the application.
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mb: 3 }}>
                    <Select
                      value={systemSettings.timezone}
                      onChange={(e) => setSystemSettings({
                        ...systemSettings,
                        timezone: e.target.value,
                      })}
                      size="small"
                      sx={{ minWidth: 300 }}
                    >
                      {Intl.supportedValuesOf('timeZone').map((tz) => (
                        <MenuItem key={tz} value={tz}>{tz}</MenuItem>
                      ))}
                    </Select>
                    <Button
                      variant="contained"
                      onClick={handleSaveSystemSettings}
                      disabled={saving}
                    >
                      Save
                    </Button>
                  </Box>

                  <Divider sx={{ my: 3 }} />

                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Site Favicon
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Upload a custom favicon for your site. Supports PNG, JPG, SVG, ICO, GIF, WebP, and BMP formats (max 2MB).
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Box
                      component="img"
                      src={`/favicon.svg?v=${faviconKey}`}
                      alt="Current favicon"
                      sx={{ width: 32, height: 32, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                    />
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFaviconUpload}
                      style={{ display: 'none' }}
                      id="favicon-upload"
                    />
                    <label htmlFor="favicon-upload">
                      <Button
                        variant="outlined"
                        component="span"
                        disabled={faviconUploading}
                      >
                        {faviconUploading ? 'Uploading...' : 'Upload New Favicon'}
                      </Button>
                    </label>
                  </Box>
                </TabPanel>
              )}

              <TabPanel value={tabIndex} index={isAdmin ? 3 : 2}>
                <AgentManagement notebooks={notebooks} />
              </TabPanel>

              {isAdmin && (
                <TabPanel value={tabIndex} index={4}>
                  <UserManagement />
                </TabPanel>
              )}

              <TabPanel value={tabIndex} index={isAdmin ? 5 : 3}>
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

              <TabPanel value={tabIndex} index={isAdmin ? 6 : 4}>
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
                  onClick={async () => {
                    try {
                      const res = await api.post('/export/token');
                      const { token } = res.data;
                      window.open(`/api/v1/export?token=${token}`, '_blank');
                    } catch {
                      alert('Failed to generate export token');
                    }
                  }}
                >
                  Export All Notes
                </Button>
              </TabPanel>

              <TabPanel value={tabIndex} index={isAdmin ? 7 : 5}>
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
