import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { useSnackbar } from "notistack";
import { getRole } from "../auth/auth";

import {
  Box,
  Typography,
  Paper,
  Stack,
  Divider,
  Grid,
  TextField,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
} from "@mui/material";

import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import EditIcon from "@mui/icons-material/Edit";

const ROLES = ["ANALYST", "ADMIN"];

function roleChipColor(role) {
  const r = String(role || "").toUpperCase();
  if (r === "ADMIN") return "warning";
  if (r === "ANALYST") return "info";
  return "default";
}

export default function Admin() {
  const { enqueueSnackbar } = useSnackbar();
  const role = (getRole() || "").toUpperCase();

  const isAdmin = useMemo(() => role === "ADMIN", [role]);
  const [authConfig, setAuthConfig] = useState({ mode: "legacy", external_user_management: false });

  const [me, setMe] = useState(null);

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "ANALYST",
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "ANALYST",
  });

  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter(u => String(u.role || "").toUpperCase() === "ADMIN").length;
    const analysts = users.filter(u => String(u.role || "").toUpperCase() === "ANALYST").length;
    return { total, admins, analysts };
  }, [users]);

  const externalUserManagement = Boolean(authConfig?.external_user_management);

  async function loadAuthConfig() {
    try {
      const res = await api.get("/auth/config");
      setAuthConfig(res.data || { mode: "legacy", external_user_management: false });
    } catch {
      setAuthConfig({ mode: "legacy", external_user_management: false });
    }
  }

  async function loadMe() {
    try {
      const res = await api.get("/admin/me");
      setMe(res.data?.user || null);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Failed to load current user";
      enqueueSnackbar(msg, { variant: "warning" });
    }
  }

  async function loadUsers() {
    if (!isAdmin) return;
    setLoadingUsers(true);
    try {
      const res = await api.get("/admin/users");
      setUsers(res.data || []);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Failed to load users";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    loadAuthConfig();
    loadMe();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createUser() {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;

    if (!name || !email || !password) {
      enqueueSnackbar("Name, email and password are required.", { variant: "warning" });
      return;
    }

    if (externalUserManagement) {
      enqueueSnackbar("User creation is managed by the external identity provider.", { variant: "info" });
      return;
    }

    setCreating(true);
    try {
      await api.post("/auth/register", {
        name,
        email,
        password,
        role: form.role,
      });

      enqueueSnackbar("User created successfully.", { variant: "success" });
      setForm({ name: "", email: "", password: "", role: "ANALYST" });
      await loadUsers();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Create user failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setCreating(false);
    }
  }

  function openDelete(u) {
    setDeleteRow(u);
    setDeleteOpen(true);
  }

  function openEdit(u) {
    setEditRow(u);
    setEditForm({
      name: u.name || "",
      email: u.email || "",
      password: "",
      role: String(u.role || "ANALYST").toUpperCase(),
    });
    setEditOpen(true);
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/users/${deleteRow.id}`);
      enqueueSnackbar("User deleted.", { variant: "success" });
      setDeleteOpen(false);
      setDeleteRow(null);
      await loadUsers();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Delete failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setDeleting(false);
    }
  }

  async function saveUserEdit() {
    if (!editRow) return;

    const payload = {
      name: editForm.name.trim(),
      email: editForm.email.trim().toLowerCase(),
      role: editForm.role,
      password: editForm.password,
    };

    if (!payload.name || !payload.email) {
      enqueueSnackbar("Name and email are required.", { variant: "warning" });
      return;
    }

    setSavingEdit(true);
    try {
      await api.put(`/admin/users/${editRow.id}`, payload);
      enqueueSnackbar("User updated.", { variant: "success" });
      setEditOpen(false);
      setEditRow(null);
      setEditForm({ name: "", email: "", password: "", role: "ANALYST" });
      await loadUsers();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Update failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setSavingEdit(false);
    }
  }

  if (!isAdmin) {
    return (
      <Box>
        <Typography variant="h5" sx={{ mb: 2 }}>Admin</Typography>
        <Alert severity="error">
          Forbidden: only ADMIN can access this page.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <AdminPanelSettingsIcon />
        <Typography variant="h5">Admin Panel</Typography>
      </Stack>

      {/* Top cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <VerifiedUserIcon />
              <Typography variant="h6">Current User</Typography>
            </Stack>
            <Divider sx={{ my: 1 }} />
            <Typography><b>ID:</b> {me?.id ?? "-"}</Typography>
            <Typography><b>Role:</b> {me?.role ?? "-"}</Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <PeopleAltIcon />
              <Typography variant="h6">User Stats</Typography>
            </Stack>
            <Divider sx={{ my: 1 }} />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Chip label={`Total: ${stats.total}`} />
              <Chip color="warning" label={`Admins: ${stats.admins}`} />
              <Chip color="info" label={`Analysts: ${stats.analysts}`} />
              <Button variant="outlined" onClick={loadUsers} disabled={loadingUsers}>
                Refresh
              </Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Create user */}
      <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <PersonAddAltIcon />
          <Typography variant="h6">Create User</Typography>
        </Stack>
        <Divider sx={{ my: 1 }} />

        {externalUserManagement && (
          <Alert severity="info" sx={{ mb: 2 }}>
            User lifecycle is managed by the external identity provider while auth mode is {authConfig.mode}.
          </Alert>
        )}

        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
            fullWidth
            disabled={externalUserManagement}
          />
          <TextField
            label="Email"
            value={form.email}
            onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
            fullWidth
            disabled={externalUserManagement}
          />
          <TextField
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
            fullWidth
            disabled={externalUserManagement}
          />
          <TextField
            select
            label="Role"
            value={form.role}
            onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))}
            sx={{ minWidth: 160 }}
            SelectProps={{ native: true }}
            disabled={externalUserManagement}
          >
            {ROLES.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </TextField>

          <Button variant="contained" onClick={createUser} disabled={creating || externalUserManagement}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
       
        </Typography>
      </Paper>

      {/* Users table */}
      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="h6">Users</Typography>
        <Divider sx={{ my: 1 }} />

        {loadingUsers ? (
          <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={70}>ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell width={120}>Role</TableCell>
                <TableCell width={200}>Created</TableCell>
                <TableCell width={120} align="right">Action</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {users.map(u => (
                <TableRow key={u.id} hover>
                  <TableCell>{u.id}</TableCell>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Chip size="small" label={u.role} color={roleChipColor(u.role)} />
                  </TableCell>
                  <TableCell>{u.created_at}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                      <Tooltip title={externalUserManagement && u.auth_source === "oidc" ? "Managed externally" : "Edit user"}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => openEdit(u)}
                            disabled={externalUserManagement && u.auth_source === "oidc"}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip
                        title={
                          me?.id === u.id
                            ? "You cannot delete your current account"
                            : (externalUserManagement && u.auth_source === "oidc")
                              ? "Managed externally"
                              : "Delete user"
                        }
                      >
                        <span>
                          <Button
                            color="error"
                            size="small"
                            startIcon={<DeleteOutlineIcon />}
                            onClick={() => openDelete(u)}
                            disabled={me?.id === u.id || (externalUserManagement && u.auth_source === "oidc")}
                          >
                            Delete
                          </Button>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}

              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography color="text.secondary" sx={{ p: 2 }}>
                      No users found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* Delete confirm dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete user?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete user <b>{deleteRow?.name}</b> ({deleteRow?.email})?
            <br />
            This can fail if the user is referenced by decisions.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="warning">
              If you change a user email used for email-code access, update the backend environment allow-list after saving.
            </Alert>
            <TextField
              label="Name"
              value={editForm.name}
              onChange={(e) => setEditForm((previousForm) => ({ ...previousForm, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Email"
              value={editForm.email}
              onChange={(e) => setEditForm((previousForm) => ({ ...previousForm, email: e.target.value }))}
              fullWidth
            />
            <TextField
              select
              label="Role"
              value={editForm.role}
              onChange={(e) => setEditForm((previousForm) => ({ ...previousForm, role: e.target.value }))}
              SelectProps={{ native: true }}
              fullWidth
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </TextField>
            <TextField
              label="New password"
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm((previousForm) => ({ ...previousForm, password: e.target.value }))}
              fullWidth
              helperText="Leave blank to keep the current password."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveUserEdit} disabled={savingEdit}>
            {savingEdit ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
