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
} from "@mui/material";

import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";

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

  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter(u => String(u.role || "").toUpperCase() === "ADMIN").length;
    const analysts = users.filter(u => String(u.role || "").toUpperCase() === "ANALYST").length;
    return { total, admins, analysts };
  }, [users]);

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

        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Email"
            value={form.email}
            onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
            fullWidth
          />
          <TextField
            select
            label="Role"
            value={form.role}
            onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))}
            sx={{ minWidth: 160 }}
            SelectProps={{ native: true }}
          >
            {ROLES.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </TextField>

          <Button variant="contained" onClick={createUser} disabled={creating}>
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
                    <Button
                      color="error"
                      size="small"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={() => openDelete(u)}
                      disabled={String(u.role || "").toUpperCase() === "ADMIN"}
                    >
                      Delete
                    </Button>
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
    </Box>
  );
}