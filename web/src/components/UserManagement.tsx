import { useState, useEffect } from 'react';
import {
  Box, List, ListItem, ListItemText, ListItemSecondaryAction, IconButton,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Switch, FormControlLabel, Typography, Alert, Chip
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { userApi, type User } from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface UserDialogProps {
  open: boolean;
  user: User | null;
  currentUserId: number | undefined;
  onClose: () => void;
  onSave: () => void;
}

function UserDialog({ open, user, currentUserId, onClose, onSave }: UserDialogProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAdminWarning, setShowAdminWarning] = useState(false);

  const isEditingSelf = user?.id === currentUserId;
  const isRemovingOwnAdmin = isEditingSelf && user?.is_admin && !isAdmin;

  useEffect(() => {
    if (open) {
      if (user) {
        setUsername(user.username);
        setEmail(user.email || '');
        setIsAdmin(user.is_admin);
        setPassword('');
      } else {
        setUsername('');
        setEmail('');
        setPassword('');
        setIsAdmin(false);
      }
      setError('');
      setShowAdminWarning(false);
    }
  }, [open, user]);

  const handleSubmit = async () => {
    setError('');

    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (!user && password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (user && password && password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (isRemovingOwnAdmin && !showAdminWarning) {
      setShowAdminWarning(true);
      return;
    }

    setSaving(true);

    try {
      if (user) {
        await userApi.update(user.id, { username, email: email || undefined, is_admin: isAdmin });
        if (password) {
          await userApi.updatePassword(user.id, password);
        }
      } else {
        await userApi.create({ username, password, email: email || undefined, is_admin: isAdmin });
      }

      if (isRemovingOwnAdmin) {
        window.location.reload();
        return;
      }

      onSave();
      onClose();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      const msg = error.response?.data?.error || 'Failed to save user';
      if (msg.includes('Username') && msg.includes('min')) {
        setError('Username must be at least 3 characters');
      } else if (msg.includes('Password') && msg.includes('min')) {
        setError('Password must be at least 6 characters');
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{user ? 'Edit User' : 'Create User'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {showAdminWarning && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            You are about to remove your own admin privileges. You will immediately lose access to user management and cannot undo this action yourself. Are you sure you want to continue?
          </Alert>
        )}
        <TextField
          fullWidth
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          margin="normal"
          required
        />
        <TextField
          fullWidth
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          margin="normal"
        />
        <TextField
          fullWidth
          label={user ? 'New Password (leave empty to keep current)' : 'Password'}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          margin="normal"
          required={!user}
        />
        <FormControlLabel
          control={
            <Switch
              checked={isAdmin}
              onChange={(e) => {
                setIsAdmin(e.target.checked);
                if (e.target.checked) setShowAdminWarning(false);
              }}
            />
          }
          label="Administrator"
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={saving}
          color={showAdminWarning ? 'warning' : 'primary'}
        >
          {showAdminWarning ? 'Confirm Remove Admin' : (user ? 'Save' : 'Create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  const currentUser = useAuthStore((s) => s.user);

  const loadUsers = async () => {
    try {
      const { data } = await userApi.list();
      setUsers(data);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedUser(null);
    setDialogOpen(true);
  };

  const handleDelete = async (user: User) => {
    try {
      await userApi.delete(user.id);
      setDeleteConfirm(null);
      loadUsers();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to delete user');
      setDeleteConfirm(null);
    }
  };

  if (loading) {
    return <Typography>Loading...</Typography>;
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Manage users who can access this ValeNote instance.
        </Typography>
        <Button startIcon={<AddIcon />} variant="outlined" onClick={handleCreate}>
          Add User
        </Button>
      </Box>

      <List>
        {users.map((user) => (
          <ListItem key={user.id} divider>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {user.username}
                  {user.is_admin && <Chip label="Admin" size="small" color="primary" />}
                  {user.id === currentUser?.id && <Chip label="You" size="small" variant="outlined" />}
                </Box>
              }
              secondary={user.email || 'No email'}
            />
            <ListItemSecondaryAction>
              <IconButton onClick={() => handleEdit(user)} size="small">
                <EditIcon />
              </IconButton>
              <IconButton
                onClick={() => setDeleteConfirm(user)}
                size="small"
                disabled={user.id === currentUser?.id}
              >
                <DeleteIcon />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>

      <UserDialog
        open={dialogOpen}
        user={selectedUser}
        currentUserId={currentUser?.id}
        onClose={() => setDialogOpen(false)}
        onSave={loadUsers}
      />

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          Are you sure you want to delete user "{deleteConfirm?.username}"?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={() => deleteConfirm && handleDelete(deleteConfirm)} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
