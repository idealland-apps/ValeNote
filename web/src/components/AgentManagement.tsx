import { useState, useEffect } from 'react';
import {
  Box, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemText, ListItemSecondaryAction, IconButton,
  Typography, Chip, Switch, FormControlLabel, Alert, CircularProgress,
  Paper, Tooltip, Collapse, Autocomplete, Checkbox, Tabs, Tab
} from '@mui/material';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import {
  Delete as DeleteIcon, Edit as EditIcon, Refresh as RefreshIcon,
  ContentCopy as CopyIcon, ExpandMore as ExpandIcon, ExpandLess as CollapseIcon,
  Help as HelpIcon
} from '@mui/icons-material';
import api from '../services/api';
import { formatTimestamp } from '../utils/time';

interface Agent {
  id: number;
  name: string;
  description: string;
  api_key_prefix: string;
  enabled: boolean;
  last_used_at?: number;
  created_at: number;
  permissions: AgentPermission[];
}

interface AgentPermission {
  notebook_id: number;
  notebook_name: string;
  access_level: string;
}

interface Notebook {
  id: number;
  name: string;
}

interface Props {
  notebooks: Notebook[];
}

export default function AgentManagement({ notebooks }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Partial<Agent> | null>(null);
  const [newAPIKey, setNewAPIKey] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);
  const [readwriteNotebooks, setReadwriteNotebooks] = useState<Notebook[]>([]);
  const [readonlyNotebooks, setReadonlyNotebooks] = useState<Notebook[]>([]);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [helpAgentName, setHelpAgentName] = useState('');
  const [mcpConfigTab, setMcpConfigTab] = useState(0);
  const [helpConfigTab, setHelpConfigTab] = useState(0);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Agent[]>('/agents');
      setAgents(data || []);
    } catch {
      setError('Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingAgent({ name: '', description: '', enabled: true });
    setReadwriteNotebooks([]);
    setReadonlyNotebooks([]);
    setNewAPIKey(null);
    setEditDialogOpen(true);
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    const rwNbs: Notebook[] = [];
    const roNbs: Notebook[] = [];
    agent.permissions.forEach(p => {
      const nb = notebooks.find(n => n.name === p.notebook_name);
      if (nb) {
        if (p.access_level === 'readwrite') {
          rwNbs.push(nb);
        } else if (p.access_level === 'read') {
          roNbs.push(nb);
        }
      }
    });
    setReadwriteNotebooks(rwNbs);
    setReadonlyNotebooks(roNbs);
    setNewAPIKey(null);
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingAgent?.name) return;

    const buildPermissions = () => {
      const perms: { notebook_id: number; access_level: string }[] = [];
      const rwIds = new Set(readwriteNotebooks.map(nb => nb.id));
      readwriteNotebooks.forEach(nb => {
        perms.push({ notebook_id: nb.id, access_level: 'readwrite' });
      });
      readonlyNotebooks.forEach(nb => {
        if (!rwIds.has(nb.id)) {
          perms.push({ notebook_id: nb.id, access_level: 'read' });
        }
      });
      return perms;
    };

    try {
      if (editingAgent.id) {
        await api.put(`/agents/${editingAgent.id}`, {
          name: editingAgent.name,
          description: editingAgent.description,
          enabled: editingAgent.enabled,
        });
        await api.put(`/agents/${editingAgent.id}/permissions`, {
          permissions: buildPermissions(),
        });
      } else {
        const { data } = await api.post<{ agent: Agent; api_key: string }>('/agents', {
          name: editingAgent.name,
          description: editingAgent.description,
        });
        setNewAPIKey(data.api_key);
        if (data.agent.id) {
          await api.put(`/agents/${data.agent.id}/permissions`, {
            permissions: buildPermissions(),
          });
        }
      }
      loadAgents();
      if (!newAPIKey && !editingAgent.id) {
        return;
      }
      if (editingAgent.id) {
        setEditDialogOpen(false);
      }
    } catch {
      setError('Failed to save agent');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this agent? This action cannot be undone.')) return;
    try {
      await api.delete(`/agents/${id}`);
      loadAgents();
    } catch {
      setError('Failed to delete agent');
    }
  };

  const handleRegenerateKey = async (id: number) => {
    if (!window.confirm('Regenerate API key? The old key will stop working immediately.')) return;
    try {
      const { data } = await api.post<{ api_key: string }>(`/agents/${id}/regenerate-key`);
      setNewAPIKey(data.api_key);
      setEditingAgent(agents.find(a => a.id === id) || null);
      setEditDialogOpen(true);
    } catch {
      setError('Failed to regenerate API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleExpand = (id: number) => {
    setExpandedAgent(expandedAgent === id ? null : id);
  };

  const showHelp = (agentName: string) => {
    setHelpAgentName(agentName);
    setHelpConfigTab(0);
    setHelpDialogOpen(true);
  };

  const getMcpConfig = (apiKey: string, tab: number) => {
    const mcpSseUrl = `${window.location.origin}/mcp/sse`;
    if (tab === 0) {
      return {
        label: 'Claude Desktop / Claude Code',
        path: 'claude_desktop_config.json or .mcp.json',
        config: `{
  "mcpServers": {
    "valenote": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "${mcpSseUrl}",
        "--header", "Authorization:Bearer ${apiKey}",
        "--allow-http"
      ]
    }
  }
}`
      };
    } else if (tab === 1) {
      return {
        label: 'VS Code + GitHub Copilot',
        path: 'VS Code Settings (settings.json)',
        config: `{
  "mcp": {
    "servers": {
      "valenote": {
        "command": "npx",
        "args": [
          "-y", "mcp-remote",
          "${mcpSseUrl}",
          "--header", "Authorization:Bearer ${apiKey}",
          "--allow-http"
        ]
      }
    }
  }
}`
      };
    } else {
      return {
        label: 'Cursor',
        path: '~/.cursor/mcp.json',
        config: `{
  "mcpServers": {
    "valenote": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "${mcpSseUrl}",
        "--header", "Authorization:Bearer ${apiKey}",
        "--allow-http"
      ]
    }
  }
}`
      };
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Manage API access for AI agents and external applications
        </Typography>
        <Button variant="contained" size="small" onClick={handleCreate}>
          Create Agent
        </Button>
      </Box>

      <List>
        {agents.map((agent) => (
          <Paper key={agent.id} sx={{ mb: 1 }}>
            <ListItem>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle1">{agent.name}</Typography>
                    <Chip
                      label={agent.enabled ? 'Enabled' : 'Disabled'}
                      color={agent.enabled ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                }
                secondary={
                  <>
                    <Typography variant="body2" color="text.secondary">
                      API Key: {agent.api_key_prefix}
                    </Typography>
                    {agent.last_used_at && (
                      <Typography variant="caption" color="text.secondary">
                        Last used: {formatTimestamp(agent.last_used_at)}
                      </Typography>
                    )}
                  </>
                }
              />
              <ListItemSecondaryAction>
                <IconButton size="small" onClick={() => toggleExpand(agent.id)}>
                  {expandedAgent === agent.id ? <CollapseIcon /> : <ExpandIcon />}
                </IconButton>
                <IconButton size="small" onClick={() => showHelp(agent.name)}>
                  <Tooltip title="Setup Guide"><HelpIcon /></Tooltip>
                </IconButton>
                <IconButton size="small" onClick={() => handleRegenerateKey(agent.id)}>
                  <Tooltip title="Regenerate API Key"><RefreshIcon /></Tooltip>
                </IconButton>
                <IconButton size="small" onClick={() => handleEdit(agent)}>
                  <EditIcon />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => handleDelete(agent.id)}>
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
            <Collapse in={expandedAgent === agent.id}>
              <Box sx={{ px: 2, pb: 2 }}>
                {agent.description && (
                  <Typography variant="body2" sx={{ mb: 1 }}>{agent.description}</Typography>
                )}
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Notebook Permissions:</Typography>
                {agent.permissions.length > 0 ? (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {agent.permissions.map((p) => (
                      <Chip
                        key={p.notebook_name}
                        label={`${p.notebook_name}: ${p.access_level}`}
                        size="small"
                        variant="outlined"
                      />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">No permissions configured</Typography>
                )}
              </Box>
            </Collapse>
          </Paper>
        ))}
        {agents.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No agents configured. Create one to enable API access.
          </Typography>
        )}
      </List>

      <Dialog open={editDialogOpen} onClose={() => !newAPIKey && setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingAgent?.id ? 'Edit Agent' : 'Create Agent'}</DialogTitle>
        <DialogContent>
          {newAPIKey && (
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>API Key generated. Copy and save it now:</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 2 }}>
                <code style={{ wordBreak: 'break-all', flex: 1 }}>{newAPIKey}</code>
                <IconButton size="small" onClick={() => copyToClipboard(newAPIKey)}>
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Box>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>MCP Configuration:</Typography>
              <Tabs
                value={mcpConfigTab}
                onChange={(_, v) => setMcpConfigTab(v)}
                sx={{ mb: 1, minHeight: 36 }}
              >
                <Tab label="Claude" sx={{ minHeight: 36, py: 0 }} />
                <Tab label="VS Code + Copilot" sx={{ minHeight: 36, py: 0 }} />
                <Tab label="Cursor" sx={{ minHeight: 36, py: 0 }} />
              </Tabs>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Add to: {getMcpConfig(newAPIKey, mcpConfigTab).path}
              </Typography>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.100' }}>
                <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', m: 0 }}>
                  {getMcpConfig(newAPIKey, mcpConfigTab).config}
                </Typography>
              </Paper>
              <Button
                size="small"
                startIcon={<CopyIcon />}
                onClick={() => copyToClipboard(getMcpConfig(newAPIKey, mcpConfigTab).config)}
                sx={{ mt: 1 }}
              >
                Copy Config
              </Button>
            </Alert>
          )}

          <TextField
            label="Name"
            value={editingAgent?.name || ''}
            onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
            fullWidth
            margin="normal"
            disabled={!!newAPIKey}
          />
          <TextField
            label="Description"
            value={editingAgent?.description || ''}
            onChange={(e) => setEditingAgent({ ...editingAgent, description: e.target.value })}
            fullWidth
            margin="normal"
            multiline
            rows={2}
            disabled={!!newAPIKey}
          />
          {editingAgent?.id && (
            <FormControlLabel
              control={
                <Switch
                  checked={editingAgent?.enabled ?? true}
                  onChange={(e) => setEditingAgent({ ...editingAgent, enabled: e.target.checked })}
                />
              }
              label="Enabled"
            />
          )}

          {!newAPIKey && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                Notebook Permissions
              </Typography>
              <Autocomplete
                multiple
                options={notebooks}
                disableCloseOnSelect
                getOptionLabel={(option) => option.name}
                value={readwriteNotebooks}
                onChange={(_, newValue) => setReadwriteNotebooks(newValue)}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderOption={(props, option, { selected }) => {
                  const { key, ...rest } = props;
                  return (
                    <li key={key} {...rest}>
                      <Checkbox
                        icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                        checkedIcon={<CheckBoxIcon fontSize="small" />}
                        style={{ marginRight: 8 }}
                        checked={selected}
                      />
                      {option.name}
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Read/Write Access" placeholder="Select notebooks" margin="normal" />
                )}
              />
              <Autocomplete
                multiple
                options={notebooks}
                disableCloseOnSelect
                getOptionLabel={(option) => option.name}
                value={readonlyNotebooks}
                onChange={(_, newValue) => setReadonlyNotebooks(newValue)}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderOption={(props, option, { selected }) => {
                  const { key, ...rest } = props;
                  return (
                    <li key={key} {...rest}>
                      <Checkbox
                        icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                        checkedIcon={<CheckBoxIcon fontSize="small" />}
                        style={{ marginRight: 8 }}
                        checked={selected}
                      />
                      {option.name}
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Read-Only Access" placeholder="Select notebooks" margin="normal" />
                )}
              />
              <Typography variant="caption" color="text.secondary">
                If a notebook appears in both lists, Read/Write takes precedence.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {newAPIKey ? (
            <Button onClick={() => { setEditDialogOpen(false); setNewAPIKey(null); }}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleSave}>Save</Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={helpDialogOpen} onClose={() => setHelpDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>How to Configure Agent: {helpAgentName}</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
            1. MCP Server Configuration
          </Typography>
          <Tabs
            value={helpConfigTab}
            onChange={(_, v) => setHelpConfigTab(v)}
            sx={{ mb: 1, minHeight: 36 }}
          >
            <Tab label="Claude Desktop / Code" sx={{ minHeight: 36, py: 0 }} />
            <Tab label="VS Code + GitHub Copilot" sx={{ minHeight: 36, py: 0 }} />
            <Tab label="Cursor" sx={{ minHeight: 36, py: 0 }} />
          </Tabs>
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Add to: {getMcpConfig('YOUR_API_KEY', helpConfigTab).path}
            </Typography>
            <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {getMcpConfig('YOUR_API_KEY', helpConfigTab).config}
            </Typography>
            <Button
              size="small"
              startIcon={<CopyIcon />}
              onClick={() => copyToClipboard(getMcpConfig('YOUR_API_KEY', helpConfigTab).config)}
              sx={{ mt: 1 }}
            >
              Copy Config
            </Button>
          </Paper>

          <Typography variant="subtitle2" gutterBottom>
            2. REST API Usage
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
            <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`# Add to HTTP request headers:
Authorization: Bearer YOUR_API_KEY

# Example - List notebooks:
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  ${window.location.origin}/api/v1/agent/notebooks

# Example - Search notes:
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${window.location.origin}/api/v1/agent/search?q=keyword"`}
            </Typography>
          </Paper>

          <Typography variant="subtitle2" gutterBottom>
            3. Available API Endpoints
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
            <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
{`GET  /api/v1/agent/notebooks          List accessible notebooks
GET  /api/v1/agent/notes?path=...     List notes (path optional, supports subdirs)
GET  /api/v1/agent/notes/:path        Read note content
POST /api/v1/agent/notes              Create note {path, content, title?, tags?}
PUT  /api/v1/agent/notes/:path        Update note {content, append?}
POST /api/v1/agent/notes/move         Move/rename note or folder {source, target}
GET  /api/v1/agent/search?q=keyword   Full-text search notes`}
            </Typography>
          </Paper>

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              API keys are only shown once when created or regenerated. If you forget your key, click "Regenerate API Key" to get a new one.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
