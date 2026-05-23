import { useState, useEffect } from 'react';
import {
  Box, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemText, ListItemSecondaryAction, IconButton,
  Typography, Chip, Switch, FormControlLabel, Alert, CircularProgress,
  Table, TableBody, TableCell, TableHead, TableRow, Radio, RadioGroup,
  Paper, Tooltip, Collapse
} from '@mui/material';
import {
  Delete as DeleteIcon, Edit as EditIcon, Refresh as RefreshIcon,
  ContentCopy as CopyIcon, ExpandMore as ExpandIcon, ExpandLess as CollapseIcon
} from '@mui/icons-material';
import api from '../services/api';

interface Agent {
  id: number;
  name: string;
  description: string;
  api_key_prefix: string;
  enabled: boolean;
  last_used_at?: string;
  created_at: string;
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
  display_name: string;
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
  const [permissions, setPermissions] = useState<Record<number, string>>({});

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
    setPermissions({});
    setNewAPIKey(null);
    setEditDialogOpen(true);
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    const perms: Record<number, string> = {};
    agent.permissions.forEach(p => {
      const nb = notebooks.find(n => n.name === p.notebook_name);
      if (nb) perms[nb.id] = p.access_level;
    });
    setPermissions(perms);
    setNewAPIKey(null);
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingAgent?.name) return;

    try {
      if (editingAgent.id) {
        await api.put(`/agents/${editingAgent.id}`, {
          name: editingAgent.name,
          description: editingAgent.description,
          enabled: editingAgent.enabled,
        });
        await api.put(`/agents/${editingAgent.id}/permissions`, {
          permissions: Object.entries(permissions)
            .filter(([, level]) => level !== 'none')
            .map(([nbId, level]) => ({
              notebook_id: parseInt(nbId),
              access_level: level,
            })),
        });
      } else {
        const { data } = await api.post<{ agent: Agent; api_key: string }>('/agents', {
          name: editingAgent.name,
          description: editingAgent.description,
        });
        setNewAPIKey(data.api_key);
        if (data.agent.id) {
          await api.put(`/agents/${data.agent.id}/permissions`, {
            permissions: Object.entries(permissions)
              .filter(([, level]) => level !== 'none')
              .map(([nbId, level]) => ({
                notebook_id: parseInt(nbId),
                access_level: level,
              })),
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
                        Last used: {new Date(agent.last_used_at).toLocaleString()}
                      </Typography>
                    )}
                  </>
                }
              />
              <ListItemSecondaryAction>
                <IconButton size="small" onClick={() => toggleExpand(agent.id)}>
                  {expandedAgent === agent.id ? <CollapseIcon /> : <ExpandIcon />}
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
              <Typography variant="subtitle2">API Key (copy now, it won't be shown again):</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <code style={{ wordBreak: 'break-all' }}>{newAPIKey}</code>
                <IconButton size="small" onClick={() => copyToClipboard(newAPIKey)}>
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Box>
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
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Notebook</TableCell>
                    <TableCell align="center">None</TableCell>
                    <TableCell align="center">Read</TableCell>
                    <TableCell align="center">Read/Write</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {notebooks.map((nb) => (
                    <TableRow key={nb.id}>
                      <TableCell>{nb.display_name || nb.name}</TableCell>
                      <TableCell align="center" padding="checkbox">
                        <RadioGroup
                          row
                          value={permissions[nb.id] || 'none'}
                          onChange={(e) => setPermissions({ ...permissions, [nb.id]: e.target.value })}
                        >
                          <Radio value="none" size="small" />
                        </RadioGroup>
                      </TableCell>
                      <TableCell align="center" padding="checkbox">
                        <Radio
                          checked={permissions[nb.id] === 'read'}
                          onChange={() => setPermissions({ ...permissions, [nb.id]: 'read' })}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center" padding="checkbox">
                        <Radio
                          checked={permissions[nb.id] === 'readwrite'}
                          onChange={() => setPermissions({ ...permissions, [nb.id]: 'readwrite' })}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
    </Box>
  );
}
